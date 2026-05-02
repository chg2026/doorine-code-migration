import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { billingBlockedResponse } from "@/lib/billing-gate";

/**
 * POST /api/draws/[id]/reject
 *
 * Marks a pending draw as Rejected and emits the `drawApprovals` notification.
 * Reject is permission-gated identically to approve since it's a payment-flow
 * decision.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "draws", "approve")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason || "").trim();

  const draw = await prisma.draw.findFirst({
    where: { id, project: { companyId: user.companyId } },
    select: {
      id: true,
      projectId: true,
      number: true,
      amount: true,
      status: true,
      project: { select: { code: true, name: true } },
    },
  });
  if (!draw) return NextResponse.json({ error: "Draw not found" }, { status: 404 });
  if (draw.status !== "Pending")
    return NextResponse.json({ error: "Draw is not pending" }, { status: 400 });

  await prisma.draw.update({
    where: { id: draw.id },
    data: { status: "Rejected" },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "draw_rejected",
      entity: "Draw",
      entityId: draw.id,
      message: reason ? `Draw #${draw.number} rejected — ${reason}` : `Draw #${draw.number} rejected.`,
      meta: { number: draw.number, amount: draw.amount.toString(), reason: reason || null },
    },
  });

  // Notify internal team + active contractors. Wrapped so any failure in the
  // notification path can't roll back the rejected draw.
  try {
    const activeContractors = await prisma.contractorAssignment.findMany({
      where: { projectId: draw.projectId, status: "Active", companyId: user.companyId },
      select: { contactId: true },
    });
    await dispatchNotification({
      companyId: user.companyId,
      event: "drawApprovals",
      projectId: draw.projectId,
      contactIds: activeContractors.map((a) => a.contactId),
      title: `Draw #${draw.number} rejected on ${draw.project.code}`,
      body: reason
        ? `$${Number(draw.amount).toLocaleString()} rejected — ${reason}`
        : `$${Number(draw.amount).toLocaleString()} rejected.`,
      link: `/rehab/${draw.project.code}/budget`,
      meta: {
        drawId: draw.id,
        drawNumber: draw.number,
        amount: draw.amount.toString(),
        projectId: draw.projectId,
        action: "rejected",
        reason: reason || null,
      },
      urgent: true,
      dedupeKey: `drawApprovals:${draw.id}:rejected`,
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
