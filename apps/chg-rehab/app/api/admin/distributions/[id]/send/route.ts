import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  DistributionAllocationStatus,
  DistributionStatus,
  InvestorActivityType,
} from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dist = await prisma.distribution.findUnique({
    where: { id },
    include: {
      offering: { select: { companyId: true, name: true } },
      allocations: {
        include: {
          subscription: { select: { investorId: true, id: true } },
        },
      },
    },
  });
  if (!dist || dist.offering.companyId !== me.companyId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.distribution.update({
      where: { id },
      data: {
        status: DistributionStatus.Sent,
        paidOn: dist.paidOn || new Date(),
      },
    });
    for (const a of dist.allocations) {
      await tx.distributionAllocation.update({
        where: { id: a.id },
        data: { status: DistributionAllocationStatus.Sent },
      });
      await tx.investorSubscription.update({
        where: { id: a.subscription.id },
        data: {
          lifetimeDistributions: {
            increment: Number(a.amount),
          },
        },
      });
      await tx.investorActivity.create({
        data: {
          investorId: a.subscription.investorId,
          eventType: InvestorActivityType.Distribution,
          title: `Distribution received — ${dist.offering.name}`,
          description: `${dist.periodLabel}: $${Number(a.amount).toLocaleString()}`,
          relatedSubscriptionId: a.subscription.id,
        },
      });
    }
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "distribution_sent",
      entity: "Distribution",
      entityId: id,
    },
  });
  return NextResponse.json({ ok: true });
}
