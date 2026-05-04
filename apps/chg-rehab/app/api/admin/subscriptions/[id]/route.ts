import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  InvestorSubscriptionStatus,
  SubscriptionCommitmentType,
} from "@prisma/client";
import { recomputeOfferingRaised } from "@/lib/investorPortalRecompute";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sub = await prisma.investorSubscription.findUnique({
    where: { id },
    include: { offering: { select: { companyId: true, id: true } } },
  });
  if (!sub || sub.offering.companyId !== me.companyId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if ("committedAmount" in body) {
    const n = Number(body.committedAmount);
    if (Number.isFinite(n) && n >= 0) data.committedAmount = n;
  }
  if ("fundedAmount" in body) {
    const n = Number(body.fundedAmount);
    if (Number.isFinite(n) && n >= 0) data.fundedAmount = n;
  }
  if (
    typeof body.commitmentType === "string" &&
    (Object.values(SubscriptionCommitmentType) as string[]).includes(
      body.commitmentType
    )
  )
    data.commitmentType = body.commitmentType as SubscriptionCommitmentType;
  if (
    typeof body.status === "string" &&
    (Object.values(InvestorSubscriptionStatus) as string[]).includes(body.status)
  )
    data.status = body.status as InvestorSubscriptionStatus;

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  await prisma.investorSubscription.update({ where: { id }, data });
  await recomputeOfferingRaised(sub.offering.id);

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "subscription_updated",
      entity: "InvestorSubscription",
      entityId: id,
      meta: { keys: Object.keys(data) },
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sub = await prisma.investorSubscription.findUnique({
    where: { id },
    include: { offering: { select: { companyId: true, id: true } } },
  });
  if (!sub || sub.offering.companyId !== me.companyId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.investorSubscription.delete({ where: { id } });
  await recomputeOfferingRaised(sub.offering.id);

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "subscription_deleted",
      entity: "InvestorSubscription",
      entityId: id,
    },
  });
  return NextResponse.json({ ok: true });
}
