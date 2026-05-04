import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";
import { InvestorActivityType } from "@prisma/client";
import { notifyInvestor } from "@/lib/notifyInvestor";
import { sendEmail } from "@/lib/replitmail";

export const dynamic = "force-dynamic";

/**
 * Investor self-attests that they've initiated the wire/ACH for their
 * commitment. This is a *heads-up only* — the operator remains the sole
 * source of truth for funded amount and subscription status.
 *
 * What we do:
 *   1. Stamp `fundedAt` (treated as the attestation timestamp). We do NOT
 *      touch `fundedAmount`, do NOT change `status`, and do NOT recompute
 *      offering raise totals — those move only after operator verification.
 *   2. Write an ActivityLogEntry on the company so the operator's
 *      activity feed surfaces a "needs verification" badge.
 *   3. Notify the investor (activity row + Resend email).
 *   4. Email the operator directly via replitmail.
 *
 * Body: { method: "wire" | "ach", reference?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const me = await getCurrentInvestor();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sub = await prisma.investorSubscription.findFirst({
    where: { id, investorId: me.id },
    include: { offering: { select: { id: true, name: true } } },
  });
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const method = body.method === "ach" ? "ACH" : "Wire";
  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference.trim()
      : null;

  const committed = Number(sub.committedAmount);
  const now = new Date();

  // Attestation-only: stamp fundedAt as the timestamp the investor said they
  // sent funds. We deliberately do NOT touch fundedAmount or status — the
  // operator confirms receipt out-of-band, which is the only path that moves
  // those fields (and triggers offering raise recompute).
  await prisma.investorSubscription.update({
    where: { id: sub.id },
    data: { fundedAt: sub.fundedAt || now },
  });

  // Operator-side activity log entry (the operator's recent-activity feed
  // surfaces these, giving them a "needs verification" badge).
  await prisma.activityLogEntry.create({
    data: {
      companyId: me.companyId,
      action: "investor_funding_attested",
      entity: "InvestorSubscription",
      entityId: sub.id,
      message: `Investor reported ${method} sent for $${Math.round(committed).toLocaleString()} on ${sub.offering.name}${reference ? ` (ref ${reference})` : ""} — verify receipt of funds.`,
      meta: { offeringId: sub.offeringId, method, reference, investorId: me.id },
    },
  });

  await notifyInvestor({
    investorId: me.id,
    event: "subscription",
    eventType: InvestorActivityType.Subscription,
    title: `Funding initiated — ${sub.offering.name}`,
    description: `${method} sent for $${Math.round(committed).toLocaleString()}${reference ? ` · ref ${reference}` : ""}. Operator will confirm receipt.`,
    link: `/investments/${sub.offeringId}/funding`,
    relatedSubscriptionId: sub.id,
  });

  // Operator email — separate from the investor notification above. We use
  // the replitmail transport directly (rather than the investor preferences
  // pipeline) because the operator is the verified Replit user on the
  // workspace and shouldn't be filtered by investor-side prefs.
  try {
    const investorName =
      [me.firstName, me.lastName].filter(Boolean).join(" ") ||
      me.email ||
      "Investor";
    const subject = `[Action] ${investorName} reported ${method} for ${sub.offering.name}`;
    const text = [
      `${investorName} (${me.email || "no email"}) reported ${method} of $${Math.round(committed).toLocaleString()}.`,
      `Offering: ${sub.offering.name}`,
      `Subscription: ${sub.id}`,
      reference ? `Reference: ${reference}` : "",
      ``,
      `Verify receipt of funds in the operator portal cap-table.`,
    ]
      .filter(Boolean)
      .join("\n");
    const html = `
      <p><strong>${escapeHtml(investorName)}</strong> (${escapeHtml(me.email || "no email")}) reported a <strong>${method}</strong> of <strong>$${Math.round(committed).toLocaleString()}</strong>.</p>
      <ul>
        <li>Offering: <strong>${escapeHtml(sub.offering.name)}</strong></li>
        <li>Subscription: <code>${sub.id}</code></li>
        ${reference ? `<li>Reference: <code>${escapeHtml(reference)}</code></li>` : ""}
      </ul>
      <p>Verify receipt of funds in the operator portal cap-table tab.</p>
    `;
    await sendEmail({ subject, text, html });
  } catch (err) {
    console.error("[confirm-funding] operator email failed", err);
  }

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
