import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";
import { InvestorActivityType } from "@prisma/client";
import { notifyInvestor } from "@/lib/notifyInvestor";

export const dynamic = "force-dynamic";

/**
 * Investor self-attests that they've paid a capital call notice. We:
 *   1. Set `amountReceived = amountDue` and stamp `receivedAt` so the
 *      operator's call ledger shows the payment as in-flight.
 *   2. Write an ActivityLogEntry on the company (operator-side badge).
 *   3. Notify the investor (activity row).
 *
 * The operator still verifies receipt of funds out-of-band before the
 * call is marked Closed; if the wire never arrives they can roll the
 * allocation back from the cap-table tab.
 *
 * Body: { method?: "wire" | "ach", reference?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentInvestor();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const call = await prisma.capitalCall.findUnique({
    where: { id },
    include: {
      offering: { select: { id: true, name: true, companyId: true } },
      allocations: {
        include: {
          subscription: { select: { id: true, investorId: true } },
        },
      },
    },
  });
  if (!call || call.offering.companyId !== me.companyId)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const myAlloc = call.allocations.find(
    (a) => a.subscription.investorId === me.id
  );
  if (!myAlloc)
    return NextResponse.json({ error: "no_allocation" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const method = body.method === "ach" ? "ACH" : "Wire";
  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference.trim()
      : null;

  const due = Number(myAlloc.amountDue);
  const now = new Date();

  await prisma.capitalCallAllocation.update({
    where: { id: myAlloc.id },
    data: {
      amountReceived: due,
      receivedAt: myAlloc.receivedAt || now,
    },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      action: "capital_call_payment_attested",
      entity: "CapitalCallAllocation",
      entityId: myAlloc.id,
      message: `Investor reported ${method} of $${Math.round(due).toLocaleString()} on capital call ${call.noticeNumber} (${call.offering.name})${reference ? ` (ref ${reference})` : ""} — verify receipt.`,
      meta: {
        capitalCallId: call.id,
        offeringId: call.offering.id,
        method,
        reference,
        investorId: me.id,
      },
    },
  });

  await notifyInvestor({
    investorId: me.id,
    event: "capitalcall",
    eventType: InvestorActivityType.CapitalCall,
    title: `Capital call payment initiated — ${call.offering.name}`,
    description: `${method} sent for $${Math.round(due).toLocaleString()} (notice ${call.noticeNumber})${reference ? ` · ref ${reference}` : ""}.`,
    link: `/capital-calls/${call.id}`,
    relatedSubscriptionId: myAlloc.subscription.id,
  });

  return NextResponse.json({ ok: true });
}
