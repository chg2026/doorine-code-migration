import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  DistributionAllocationStatus,
  DistributionStatus,
  DistributionType,
} from "@prisma/client";
import {
  allocateProRataCents,
  centsToDollars,
  dollarsToCents,
} from "@/lib/investorAllocate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const offeringId = typeof body.offeringId === "string" ? body.offeringId : "";
  const periodLabel =
    typeof body.periodLabel === "string" ? body.periodLabel.trim() : "";
  const totalAmount = Number(body.totalAmount);
  const distributionType =
    typeof body.distributionType === "string" &&
    (Object.values(DistributionType) as string[]).includes(body.distributionType)
      ? (body.distributionType as DistributionType)
      : DistributionType.CashFlow;
  const paidOn =
    typeof body.paidOn === "string" && body.paidOn ? new Date(body.paidOn) : null;

  if (!offeringId || !periodLabel)
    return NextResponse.json(
      { error: "offeringId and periodLabel required" },
      { status: 400 }
    );
  if (!Number.isFinite(totalAmount) || totalAmount <= 0)
    return NextResponse.json(
      { error: "totalAmount must be > 0" },
      { status: 400 }
    );

  const offering = await prisma.offering.findFirst({
    where: { id: offeringId, companyId: me.companyId },
    include: {
      subscriptions: {
        where: { status: { in: ["Active", "Closed"] } },
      },
    },
  });
  if (!offering)
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });

  const eligible = offering.subscriptions.filter(
    (s) => Number(s.fundedAmount) > 0
  );
  if (eligible.length === 0)
    return NextResponse.json(
      { error: "No funded subscriptions to distribute to" },
      { status: 400 }
    );

  const totalCents = dollarsToCents(totalAmount);
  const allocations = allocateProRataCents(
    totalCents,
    eligible.map((s) => ({ id: s.id, weight: Number(s.fundedAmount) }))
  );

  const totalFunded = eligible.reduce(
    (s, x) => s + Number(x.fundedAmount),
    0
  );
  const perDollarRate = totalFunded > 0 ? totalAmount / totalFunded : 0;

  const dist = await prisma.$transaction(async (tx) => {
    const created = await tx.distribution.create({
      data: {
        offeringId,
        periodLabel,
        distributionType,
        totalAmount,
        perDollarRate: Number(perDollarRate.toFixed(6)),
        paidOn,
        status: DistributionStatus.Pending,
      },
    });
    for (const a of allocations) {
      await tx.distributionAllocation.create({
        data: {
          distributionId: created.id,
          subscriptionId: a.id,
          amount: centsToDollars(a.cents),
          status: DistributionAllocationStatus.Pending,
        },
      });
    }
    return created;
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "distribution_created",
      entity: "Distribution",
      entityId: dist.id,
      meta: {
        offeringId,
        totalAmount,
        rows: allocations.length,
      },
    },
  });

  return NextResponse.json({ ok: true, id: dist.id });
}
