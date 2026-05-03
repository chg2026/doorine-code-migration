import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  CapitalCallStatus,
  InvestorActivityType,
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
  const noticeNumber =
    typeof body.noticeNumber === "string" ? body.noticeNumber.trim() : "";
  const totalAmount = Number(body.totalAmount);
  const dueDate =
    typeof body.dueDate === "string" && body.dueDate ? new Date(body.dueDate) : null;
  const memo = typeof body.memo === "string" ? body.memo : null;

  if (!offeringId || !noticeNumber)
    return NextResponse.json(
      { error: "offeringId and noticeNumber required" },
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
        where: { status: { in: ["Pending", "Active"] } },
      },
    },
  });
  if (!offering)
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });

  const eligible = offering.subscriptions.filter(
    (s) => Number(s.committedAmount) > 0
  );
  if (eligible.length === 0)
    return NextResponse.json(
      { error: "No committed subscriptions to call against" },
      { status: 400 }
    );

  const totalCents = dollarsToCents(totalAmount);
  const allocations = allocateProRataCents(
    totalCents,
    eligible.map((s) => ({ id: s.id, weight: Number(s.committedAmount) }))
  );

  const call = await prisma.$transaction(async (tx) => {
    const created = await tx.capitalCall.create({
      data: {
        offeringId,
        noticeNumber,
        totalAmount,
        dueDate,
        memo,
        status: CapitalCallStatus.Issued,
        issuedAt: new Date(),
      },
    });
    for (const a of allocations) {
      await tx.capitalCallAllocation.create({
        data: {
          capitalCallId: created.id,
          subscriptionId: a.id,
          amountDue: centsToDollars(a.cents),
        },
      });
    }
    // Notify investors via activity feed.
    for (const s of eligible) {
      await tx.investorActivity.create({
        data: {
          investorId: s.investorId,
          eventType: InvestorActivityType.CapitalCall,
          title: `Capital call issued — ${offering.name}`,
          description: `Notice ${noticeNumber}: $${totalAmount.toLocaleString()} total`,
          relatedSubscriptionId: s.id,
        },
      });
    }
    return created;
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      actorId: me.id,
      action: "capital_call_issued",
      entity: "CapitalCall",
      entityId: call.id,
      meta: { offeringId, noticeNumber, totalAmount, rows: allocations.length },
    },
  });

  return NextResponse.json({ ok: true, id: call.id });
}
