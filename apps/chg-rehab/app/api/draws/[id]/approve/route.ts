import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertPaymentApprovable, PaymentGateError } from "@/lib/paymentGate";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { billingBlockedResponse } from "@/lib/billing-gate";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "draws", "approve")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { id } = await params;
  const draw = await prisma.draw.findFirst({
    where: { id, project: { companyId: user.companyId } },
    select: {
      id: true,
      projectId: true,
      phaseId: true,
      number: true,
      amount: true,
      project: { select: { code: true, name: true } },
    },
  });
  if (!draw) return NextResponse.json({ error: "Draw not found" }, { status: 404 });

  try {
    await assertPaymentApprovable(user.companyId, {
      projectId: draw.projectId,
      phaseId: draw.phaseId,
    });
  } catch (e) {
    if (e instanceof PaymentGateError) {
      return NextResponse.json(
        { error: e.message, reasons: e.reasons, code: "STRICT_PAYMENT_GATE" },
        { status: 412 }
      );
    }
    throw e;
  }

  const updated = await prisma.draw.update({
    where: { id: draw.id },
    data: {
      status: "Approved",
      approvedAt: new Date(),
      approvedById: user.id,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "draw_approved",
      entity: "Draw",
      entityId: updated.id,
      meta: { number: updated.number, amount: updated.amount.toString() },
    },
  });

  // Notify internal team + active contractors on this project. Wrapped so any
  // failure in the notification path can't roll back the approved draw.
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
      title: `Draw #${draw.number} approved on ${draw.project.code}`,
      body: `$${Number(draw.amount).toLocaleString()} approved for ${draw.project.name}.`,
      link: `/rehab/${draw.project.code}/budget`,
      meta: {
        drawId: draw.id,
        drawNumber: draw.number,
        amount: draw.amount.toString(),
        projectId: draw.projectId,
        action: "approved",
      },
      dedupeKey: `drawApprovals:${draw.id}:approved`,
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
