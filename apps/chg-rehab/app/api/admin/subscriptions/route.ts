import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  InvestorSubscriptionStatus,
  SubscriptionCommitmentType,
} from "@prisma/client";
import { recomputeOfferingRaised } from "@/lib/investorPortalRecompute";
import { dispatchInvestorNotification } from "@/lib/notifications/investor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const investorId = typeof body.investorId === "string" ? body.investorId : "";
  const offeringId = typeof body.offeringId === "string" ? body.offeringId : "";
  const committed = Number(body.committedAmount);
  const funded = body.fundedAmount === undefined ? 0 : Number(body.fundedAmount);
  const commitmentType =
    typeof body.commitmentType === "string" &&
    (Object.values(SubscriptionCommitmentType) as string[]).includes(
      body.commitmentType
    )
      ? (body.commitmentType as SubscriptionCommitmentType)
      : SubscriptionCommitmentType.Soft;

  if (!investorId || !offeringId)
    return NextResponse.json(
      { error: "investorId and offeringId required" },
      { status: 400 }
    );
  if (!Number.isFinite(committed) || committed <= 0)
    return NextResponse.json(
      { error: "committedAmount must be > 0" },
      { status: 400 }
    );

  const [investor, offering] = await Promise.all([
    prisma.investor.findFirst({ where: { id: investorId, companyId: me.companyId } }),
    prisma.offering.findFirst({ where: { id: offeringId, companyId: me.companyId } }),
  ]);
  if (!investor || !offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Track whether this is a brand-new subscription so we only fire the
  // `newdeal` investor notification on first allocation, not on edits.
  const existing = await prisma.investorSubscription.findUnique({
    where: { investorId_offeringId: { investorId, offeringId } },
    select: { id: true },
  });

  const sub = await prisma.investorSubscription.upsert({
    where: { investorId_offeringId: { investorId, offeringId } },
    create: {
      investorId,
      offeringId,
      committedAmount: committed,
      fundedAmount: funded,
      commitmentType,
      signedAt: new Date(),
      status:
        funded > 0
          ? InvestorSubscriptionStatus.Active
          : InvestorSubscriptionStatus.Pending,
    },
    update: {
      committedAmount: committed,
      fundedAmount: funded,
      commitmentType,
    },
  });

  await recomputeOfferingRaised(offeringId);

  if (!existing) {
    await dispatchInvestorNotification({
      investorId,
      event: "newdeal",
      title: `Added to a new deal — ${offering.name}`,
      description: `Commitment: $${committed.toLocaleString()}`,
      relatedSubscriptionId: sub.id,
    });
  }

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "subscription_upserted",
      entity: "InvestorSubscription",
      entityId: sub.id,
      meta: { investorId, offeringId, committed, funded },
    },
  });

  return NextResponse.json({ ok: true, id: sub.id });
}
