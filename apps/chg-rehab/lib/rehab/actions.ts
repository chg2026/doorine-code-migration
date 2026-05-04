"use server";

import { prisma } from "../prisma";
import { getCurrentUser } from "../auth";
import { can } from "../permissions";
import { canReleaseDraw, getPhaseGate, type PhaseGateState } from "../paymentGate";
import { parseProjectMeta } from "./types";
import { revalidatePath } from "next/cache";
import { ChecklistStatus, DrawStatus } from "@prisma/client";
import { dispatchNotification } from "../notifications/dispatch";
import { assertBillingOk, BillingBlockedError, BILLING_BLOCKED_CODE } from "../billing-gate";
import { assertValidStoredUpload } from "../serverFileValidation";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

async function loadProjectForChecklistItem(itemId: string) {
  const item = await prisma.checklistItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { phase: { include: { project: true } } },
  });
  return item;
}

/**
 * Toggle a checklist item between Pending and Done. Returns the freshly
 * computed gate state for the parent phase so the client can update without
 * a page reload.
 */
export async function toggleChecklistItem(itemId: string): Promise<PhaseGateState> {
  const user = await requireUser();
  const item = await loadProjectForChecklistItem(itemId);
  if (item.phase.project.companyId !== user.companyId) {
    throw new Error("Forbidden");
  }
  const allowed = await can(user, "checklist", "edit");
  if (!allowed) throw new Error("Not authorized to edit checklist");

  const next: ChecklistStatus =
    item.status === ChecklistStatus.Done ? ChecklistStatus.Pending : ChecklistStatus.Done;

  await prisma.checklistItem.update({
    where: { id: item.id },
    data: {
      status: next,
      doneBy: next === ChecklistStatus.Done ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || user.id : null,
      doneAt: next === ChecklistStatus.Done ? new Date() : null,
    },
  });

  // Audit
  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: next === ChecklistStatus.Done ? "checklist.verified" : "checklist.unverified",
      entity: "ChecklistItem",
      entityId: item.id,
      message: `Phase ${item.phase.number} — ${item.phase.name}. "${item.label}" ${
        next === ChecklistStatus.Done ? "verified" : "unverified"
      } by ${user.firstName ?? user.email ?? "user"}.`,
      meta: { type: "system", phaseId: item.phaseId, projectId: item.phase.projectId },
    },
  });

  const gate = await getPhaseGate(item.phaseId);
  revalidatePath(`/rehab/${item.phase.project.code}/checklist`);
  revalidatePath(`/rehab/${item.phase.project.code}/activity`);
  return gate;
}

export type ReleaseDrawResult =
  | { ok: true; gate: PhaseGateState }
  | { ok: false; reason: string };

/**
 * Release a draw for a phase. Calls into `getPhaseGate` (the single source of
 * truth for gate state) and `canReleaseDraw` to honor `companySettings.strictGate`.
 * If strict gate is true, hard-blocks. If false, allows release with an
 * advisory and writes an audit entry tagged accordingly.
 */
export async function releaseDraw(
  phaseId: string,
  opts: { advisoryAck?: boolean } = {}
): Promise<ReleaseDrawResult> {
  const user = await requireUser();
  const phase = await prisma.phase.findUniqueOrThrow({
    where: { id: phaseId },
    include: { project: true },
  });
  if (phase.project.companyId !== user.companyId) {
    return { ok: false, reason: "Forbidden" };
  }
  const allowed = await can(user, "draws", "approve");
  if (!allowed) return { ok: false, reason: "Not authorized to release draws" };

  try {
    await assertBillingOk(user.companyId);
  } catch (e) {
    if (e instanceof BillingBlockedError) {
      return { ok: false, reason: BILLING_BLOCKED_CODE };
    }
    throw e;
  }

  const settings = await prisma.companySetting.findUnique({
    where: { companyId: user.companyId },
  });
  const strict = settings?.strictGate ?? true;

  const gate = await getPhaseGate(phaseId);
  const check = canReleaseDraw(gate, strict);
  if (!check.ok) {
    if (check.reason === "checklist-incomplete" && check.advisoryAllowed && opts.advisoryAck) {
      // continue — advisory mode acknowledged
    } else {
      return { ok: false, reason: check.reason };
    }
  }
  if (!gate.draw) return { ok: false, reason: "no-draw" };

  const releasedAt = new Date();
  const drawAmount = Number(gate.draw.amount);
  const releasedByName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || user.id;

  // Record the release on the Draw row itself (single-step approve+pay in the
  // prototype) and write a full release record to the activity log so that
  // every release has an immutable audit entry with the dollar amount, the
  // releasing user, the timestamp, and the gate snapshot at the moment of
  // release.
  await prisma.draw.update({
    where: { id: gate.draw.id },
    data: {
      status: DrawStatus.Approved,
      approvedAt: releasedAt,
      approvedById: user.id,
      paidAt: releasedAt,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "draw.approved",
      entity: "Draw",
      entityId: gate.draw.id,
      message: `Draw #${gate.draw.number} approved — $${drawAmount.toLocaleString()} for Phase ${phase.number}: ${phase.name}.${
        check.ok ? "" : " (Released in advisory mode — checklist incomplete.)"
      }`,
      meta: {
        type: "payment",
        drawNumber: gate.draw.number,
        drawId: gate.draw.id,
        amount: drawAmount,
        releasedAt: releasedAt.toISOString(),
        releasedById: user.id,
        releasedBy: releasedByName,
        phaseId,
        phaseNumber: phase.number,
        phaseName: phase.name,
        projectId: phase.projectId,
        gateOpen: gate.isOpen,
        gateDoneItems: gate.doneItems,
        gateTotalItems: gate.totalItems,
        advisory: !check.ok,
        strict,
      },
    },
  });

  // Notify internal team + active contractors. Wrapped so a notification
  // failure can't roll back the released draw.
  try {
    const activeContractors = await prisma.contractorAssignment.findMany({
      where: { projectId: phase.projectId, status: "Active", companyId: user.companyId },
      select: { contactId: true },
    });
    await dispatchNotification({
      companyId: user.companyId,
      event: "drawApprovals",
      projectId: phase.projectId,
      contactIds: activeContractors.map((a) => a.contactId),
      title: `Draw #${gate.draw.number} approved on ${phase.project.code}`,
      body: `$${drawAmount.toLocaleString()} released for Phase ${phase.number}: ${phase.name}.${
        check.ok ? "" : " (Advisory mode — checklist incomplete.)"
      }`,
      link: `/rehab/${phase.project.code}/budget`,
      meta: {
        drawId: gate.draw.id,
        drawNumber: gate.draw.number,
        amount: drawAmount,
        phaseId,
        phaseNumber: phase.number,
        projectId: phase.projectId,
        action: "approved",
        advisory: !check.ok,
      },
      dedupeKey: `drawApprovals:${gate.draw.id}:approved`,
    });
  } catch {
    // best-effort
  }

  const fresh = await getPhaseGate(phaseId);
  revalidatePath(`/rehab/${phase.project.code}/checklist`);
  revalidatePath(`/rehab/${phase.project.code}/overview`);
  revalidatePath(`/rehab/${phase.project.code}/budget`);
  revalidatePath(`/rehab/${phase.project.code}/activity`);
  return { ok: true, gate: fresh };
}

export async function postNote(projectCode: string, content: string, kind: "note" | "task" = "note") {
  const user = await requireUser();
  if (!content.trim()) throw new Error("Empty note");
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "rehab", "edit");
  if (!allowed) throw new Error("Not authorized to post notes");
  await assertBillingOk(user.companyId);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: kind === "task" ? "task.posted" : "note.posted",
      entity: kind === "task" ? "Task" : "Note",
      entityId: project.id,
      message: content.trim(),
      meta: { type: kind === "task" ? "task" : "note", projectId: project.id },
    },
  });
  revalidatePath(`/rehab/${project.code}/activity`);
  revalidatePath(`/rehab/${project.code}/overview`);
}

export async function fileException(projectCode: string, phaseNumber: number, summary: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "rehab", "edit");
  if (!allowed) throw new Error("Not authorized");
  const entry = await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "exception.filed",
      entity: "Phase",
      message: `Phase ${phaseNumber} — exception filed: ${summary.trim()} · Penalty paused.`,
      meta: { type: "flag", phaseNumber, projectId: project.id },
    },
  });
  await dispatchNotification({
    companyId: user.companyId,
    event: "exceptions",
    projectId: project.id,
    title: `Exception filed on ${project.code} Phase ${phaseNumber}`,
    body: summary.trim(),
    link: `/rehab/${project.code}/activity`,
    meta: {
      activityId: entry.id,
      projectId: project.id,
      phaseNumber,
      summary: summary.trim(),
    },
    urgent: true,
    dedupeKey: `exceptions:${entry.id}`,
  }).catch(() => undefined);
  revalidatePath(`/rehab/${project.code}/activity`);
  revalidatePath(`/rehab/${project.code}/sow`);
}

export async function addProjectAddendum(projectCode: string, title: string, reason: string, deltaDollars: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "rehab", "approve");
  if (!allowed) throw new Error("Not authorized");
  await assertBillingOk(user.companyId);
  const created = await prisma.projectAddendum.create({
    data: { projectId: project.id, title: title.trim(), reason: reason.trim() || null, delta: deltaDollars || "0", status: "Pending" },
  });
  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "addendum.created",
      entity: "Addendum",
      entityId: created.id,
      message: `${title.trim()} created (delta $${deltaDollars || "0"}).`,
      meta: { type: "system", projectId: project.id },
    },
  });
  revalidatePath(`/rehab/${project.code}/sow`);
  revalidatePath(`/rehab/${project.code}/activity`);
}

export async function setPmLed(projectCode: string, pmLed: boolean) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "rehab", "edit");
  if (!allowed) throw new Error("Not authorized");

  const meta = parseProjectMeta(project.meta);
  const next = { ...meta, pmLed, mode: pmLed ? "PM-Led" : "Contractor-Led" };

  await prisma.project.update({
    where: { id: project.id },
    data: { meta: next },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "project.modeChanged",
      entity: "Project",
      entityId: project.id,
      message: `Project mode set to ${next.mode}.`,
      meta: { type: "system", projectId: project.id, pmLed },
    },
  });

  revalidatePath(`/rehab/${project.code}/overview`);
  revalidatePath(`/rehab/${project.code}/sow`);
  revalidatePath(`/rehab/${project.code}/budget`);
  revalidatePath(`/rehab/${project.code}/schedule`);
  revalidatePath(`/rehab/${project.code}/checklist`);
  revalidatePath(`/rehab/${project.code}/documents`);
  revalidatePath(`/rehab/${project.code}/activity`);
}

export async function requestChangeOrder(
  projectCode: string,
  phaseNumber: number,
  scope: string,
  estimateDollars: string
) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "rehab", "edit");
  if (!allowed) throw new Error("Not authorized");
  if (!scope.trim()) throw new Error("Scope required");
  await assertBillingOk(user.companyId);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "changeOrder.requested",
      entity: "Phase",
      message: `Phase ${phaseNumber} — change order requested: ${scope.trim()}${estimateDollars ? ` (estimate $${estimateDollars})` : ""}.`,
      meta: {
        type: "changeOrder",
        phaseNumber,
        projectId: project.id,
        estimate: estimateDollars || "0",
        scope: scope.trim(),
        coStatus: "pending",
      },
    },
  });
  revalidatePath(`/rehab/${project.code}/sow`);
  revalidatePath(`/rehab/${project.code}/activity`);
}

export async function approveChangeOrder(activityEntryId: string, projectCode: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "sow", "edit");
  if (!allowed) throw new Error("Not authorized");

  const entry = await prisma.activityLogEntry.findUnique({
    where: { id: activityEntryId },
  });
  if (!entry || entry.companyId !== user.companyId) throw new Error("Activity entry not found");
  if (entry.action !== "changeOrder.requested") throw new Error("Not a change order request entry");
  const rawMeta = (entry.meta ?? {}) as Record<string, unknown>;
  if (rawMeta.projectId !== project.id) throw new Error("Entry does not belong to this project");
  if (rawMeta.coStatus === "approved" || rawMeta.coStatus === "rejected") {
    throw new Error("Change order has already been resolved");
  }

  const scope = typeof rawMeta.scope === "string" ? rawMeta.scope : "";
  const estimate = typeof rawMeta.estimate === "string" ? rawMeta.estimate : "0";
  const phaseNumber = typeof rawMeta.phaseNumber === "number" ? rawMeta.phaseNumber : null;

  await prisma.$transaction([
    prisma.activityLogEntry.update({
      where: { id: activityEntryId },
      data: { meta: { ...rawMeta, coStatus: "approved" } },
    }),
    prisma.activityLogEntry.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "changeOrder.approved",
        entity: "Phase",
        message: `Phase ${phaseNumber ?? "?"} — change order approved${scope ? `: ${scope}` : ""}${estimate && estimate !== "0" ? ` (estimate $${estimate})` : ""}.`,
        meta: {
          type: "changeOrder",
          phaseNumber,
          projectId: project.id,
          coStatus: "approved",
          refEntryId: activityEntryId,
        },
      },
    }),
    prisma.projectAddendum.create({
      data: {
        projectId: project.id,
        title: `CO — Phase ${phaseNumber ?? "?"}: ${scope || "Change order"}`,
        reason: scope || null,
        delta: estimate && estimate !== "0" ? parseFloat(estimate) : null,
        status: "Approved",
      },
    }),
  ]);

  revalidatePath(`/rehab/${project.code}/sow`);
  revalidatePath(`/rehab/${project.code}/activity`);
}

export async function rejectChangeOrder(
  activityEntryId: string,
  projectCode: string,
  reason: string
) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "sow", "edit");
  if (!allowed) throw new Error("Not authorized");
  if (!reason.trim()) throw new Error("Rejection reason required");

  const entry = await prisma.activityLogEntry.findUnique({
    where: { id: activityEntryId },
  });
  if (!entry || entry.companyId !== user.companyId) throw new Error("Activity entry not found");
  if (entry.action !== "changeOrder.requested") throw new Error("Not a change order request entry");
  const rawMeta = (entry.meta ?? {}) as Record<string, unknown>;
  if (rawMeta.projectId !== project.id) throw new Error("Entry does not belong to this project");
  if (rawMeta.coStatus === "approved" || rawMeta.coStatus === "rejected") {
    throw new Error("Change order has already been resolved");
  }

  const scope = typeof rawMeta.scope === "string" ? rawMeta.scope : "";
  const phaseNumber = typeof rawMeta.phaseNumber === "number" ? rawMeta.phaseNumber : null;

  await prisma.$transaction([
    prisma.activityLogEntry.update({
      where: { id: activityEntryId },
      data: { meta: { ...rawMeta, coStatus: "rejected", coRejectionReason: reason.trim() } },
    }),
    prisma.activityLogEntry.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "changeOrder.rejected",
        entity: "Phase",
        message: `Phase ${phaseNumber ?? "?"} — change order rejected${scope ? ` (${scope})` : ""}. Reason: ${reason.trim()}`,
        meta: {
          type: "changeOrder",
          phaseNumber,
          projectId: project.id,
          coStatus: "rejected",
          refEntryId: activityEntryId,
        },
      },
    }),
  ]);

  revalidatePath(`/rehab/${project.code}/sow`);
  revalidatePath(`/rehab/${project.code}/activity`);
}

export async function uploadProjectDocument(
  projectCode: string,
  data: { name: string; category: string; fileKey?: string; mimeType?: string; size?: number }
) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: projectCode } },
  });
  if (!project) throw new Error("Project not found");
  const allowed = await can(user, "documents", "edit");
  if (!allowed) throw new Error("Not authorized");
  if (!data.name.trim()) throw new Error("Name required");
  await assertValidStoredUpload(data.fileKey);
  await assertBillingOk(user.companyId);

  const doc = await prisma.document.create({
    data: {
      companyId: user.companyId,
      level: "Project",
      category: data.category || "Misc",
      name: data.name.trim(),
      fileKey: data.fileKey,
      mimeType: data.mimeType,
      size: data.size,
      uploadedById: user.id,
      projectId: project.id,
      propertyId: project.propertyId,
    },
  });
  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "document.uploaded",
      entity: "Document",
      entityId: doc.id,
      message: `${doc.name} uploaded · Category: ${doc.category} · Project: ${project.code}.`,
      meta: { type: "document", projectId: project.id },
    },
  });
  revalidatePath(`/rehab/${project.code}/documents`);
  revalidatePath(`/rehab/${project.code}/activity`);
}
