import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  extractInvoiceDeclineReason,
  isStripeConfigured,
  loadOrCreateSubscription,
  requireStripe,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const sub = await loadOrCreateSubscription(user.companyId);
  if (!sub.stripeCustomerId) {
    return NextResponse.json({ invoices: [] });
  }

  const stripe = requireStripe();
  const list = await stripe.invoices.list({
    customer: sub.stripeCustomerId,
    limit: 24,
  });

  // Pre-compute which rows we'd need a decline reason for so we can do one
  // batched DB lookup instead of per-row work. The webhook writes
  // `declineCode`/`declineMessage` into ActivityLogEntry.meta whenever
  // `invoice.payment_failed` fires, so in the steady state we can read the
  // reason from our own DB instead of round-tripping to Stripe per invoice.
  const openInvoiceIds = list.data
    .filter((inv) => inv.status !== "paid" && inv.status !== "void")
    .map((inv) => inv.id)
    .filter((id): id is string => Boolean(id));

  const cachedReasons = new Map<
    string,
    { code: string | null; message: string | null }
  >();
  if (openInvoiceIds.length > 0) {
    const entries = await prisma.activityLogEntry.findMany({
      where: {
        companyId: user.companyId,
        action: "billing_invoice_payment_failed",
        entity: "Invoice",
        entityId: { in: openInvoiceIds },
      },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, meta: true },
    });
    // Newest entry per invoice wins (the same invoice can fail multiple times
    // as Stripe retries) — `orderBy desc` + skip-if-already-seen gives that.
    for (const entry of entries) {
      if (!entry.entityId || cachedReasons.has(entry.entityId)) continue;
      const meta =
        entry.meta && typeof entry.meta === "object" && !Array.isArray(entry.meta)
          ? (entry.meta as Record<string, unknown>)
          : null;
      const code =
        meta && typeof meta.declineCode === "string" ? meta.declineCode : null;
      const message =
        meta && typeof meta.declineMessage === "string"
          ? meta.declineMessage
          : null;
      // Only count it as a hit if the webhook actually persisted a reason —
      // otherwise fall through to the live Stripe lookup below.
      if (code || message) {
        cachedReasons.set(entry.entityId, { code, message });
      }
    }
  }

  const invoices = await Promise.all(
    list.data.map(async (inv) => {
      const status =
        inv.status === "paid"
          ? "Paid"
          : inv.status === "void"
            ? "Void"
            : "Open";

      // Enrich failed/open invoices with the underlying decline reason so the
      // history table can show "Reason: …" inline. Paid/void rows skip the
      // lookup entirely. Open rows prefer the webhook-cached reason on
      // ActivityLogEntry; only invoices we have no cached entry for fall
      // through to the slow per-invoice Stripe round-trip.
      let declineCode: string | null = null;
      let declineMessage: string | null = null;
      if (status === "Open") {
        const cached = inv.id ? cachedReasons.get(inv.id) : undefined;
        if (cached) {
          declineCode = cached.code;
          declineMessage = cached.message;
        } else {
          const reason = await extractInvoiceDeclineReason(stripe, inv);
          declineCode = reason.code;
          declineMessage = reason.message;
        }
      }

      return {
        id: inv.number || inv.id,
        stripeInvoiceId: inv.id,
        date: inv.created ? new Date(inv.created * 1000).toISOString().slice(0, 10) : null,
        amountCents: inv.amount_due ?? inv.amount_paid ?? inv.total ?? 0,
        currency: inv.currency,
        status,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        invoicePdf: inv.invoice_pdf ?? null,
        declineCode,
        declineMessage,
      };
    }),
  );

  return NextResponse.json({ invoices });
}
