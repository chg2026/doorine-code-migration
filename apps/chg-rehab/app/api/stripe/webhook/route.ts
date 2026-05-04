import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { publishBillingChanged } from "@/lib/billingEvents";
import {
  cachePaymentMethod,
  extractInvoiceDeclineReason,
  findCompanyByStripeCustomerId,
  isStripeConfigured,
  requireStripe,
  syncFromStripeSubscription,
} from "@/lib/stripe";
import {
  isHealthyStatus,
  isUnhealthyStatus,
  notifyAdminsOfBillingIssue,
  notifyAdminsOfBillingRecovery,
} from "@/lib/notifications/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhook: keep the local Subscription row + payment-method cache in
 * sync with Stripe state. Verifies signature against STRIPE_WEBHOOK_SECRET.
 *
 * In Next.js (App Router) we read the raw body via `req.text()` so the Stripe
 * signature check sees the exact bytes.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret)
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = requireStripe();
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    await handleEvent(event, stripe);
  } catch (err) {
    // Log and 500 so Stripe retries.
    console.error("[stripe/webhook] failed", event.type, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event, stripe: Stripe) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.resumed":
    case "customer.subscription.paused": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const companyId = await findCompanyByStripeCustomerId(customerId);
      if (!companyId) return;
      // Capture the prior locally-tracked status so we can detect whether
      // this webhook represents a *transition* into or out of a billing
      // problem (vs a duplicate redelivery of the same status).
      const priorRow = await prisma.subscription.findUnique({
        where: { companyId },
        select: { status: true, currentPeriodEnd: true },
      });
      const priorStatus = priorRow?.status ?? null;
      // Re-fetch with expansions so we get product metadata + period info.
      const fresh = await stripe.subscriptions.retrieve(sub.id, {
        expand: ["items.data.price.product", "default_payment_method"],
      });
      const updated = await syncFromStripeSubscription(companyId, fresh);
      // Subscription status flipping in/out of past_due/unpaid changes the
      // top-nav billing badge — push so connected clients refresh now.
      publishBillingChanged(companyId);

      // Bucket dedupes alerts to one per (status, incident) so a webhook
      // redelivery with the same status doesn't re-email admins. We prefer
      // the latest invoice id so both this branch and the `invoice.payment_failed`
      // branch (below) collapse to the SAME dedupe slot for the same incident
      // — that way Stripe firing both events around an initial failure only
      // produces one admin email per admin.
      const latestInvoiceId =
        typeof fresh.latest_invoice === "string"
          ? fresh.latest_invoice
          : fresh.latest_invoice?.id ?? null;
      const bucket =
        latestInvoiceId ??
        (updated.currentPeriodEnd
          ? updated.currentPeriodEnd.toISOString()
          : updated.stripeSubscriptionId ?? "current");
      const wasUnhealthy = isUnhealthyStatus(priorStatus);
      const nowUnhealthy = isUnhealthyStatus(updated.status);
      const nowHealthy = isHealthyStatus(updated.status);
      // Healthy → unhealthy (or unknown → unhealthy): immediate alert.
      if (nowUnhealthy && !wasUnhealthy) {
        await notifyAdminsOfBillingIssue({
          companyId,
          status: updated.status,
          dedupeBucket: bucket,
        }).catch((err) => console.warn("[stripe/webhook] billing alert failed", err));
      }
      // Unhealthy → healthy: one-time recovery email so admins know it's done.
      if (nowHealthy && wasUnhealthy) {
        await notifyAdminsOfBillingRecovery({
          companyId,
          status: updated.status,
          dedupeBucket: bucket,
        }).catch((err) => console.warn("[stripe/webhook] billing recovery alert failed", err));
      }
      break;
    }

    case "payment_method.attached":
    case "payment_method.detached":
    case "payment_method.updated": {
      const pm = event.data.object as Stripe.PaymentMethod;
      const customerId =
        typeof pm.customer === "string"
          ? pm.customer
          : pm.customer?.id ?? null;
      if (!customerId) return;
      const companyId = await findCompanyByStripeCustomerId(customerId);
      if (!companyId) return;
      // Only refresh cache if this PM is the customer's default.
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !("deleted" in customer && customer.deleted)) {
        const defaultPmId = customer.invoice_settings?.default_payment_method;
        const defaultPmIdResolved =
          typeof defaultPmId === "string" ? defaultPmId : defaultPmId?.id ?? null;
        if (defaultPmIdResolved === pm.id) {
          await cachePaymentMethod(companyId, pm);
        } else if (event.type === "payment_method.detached") {
          await cachePaymentMethod(companyId, null);
        }
      }
      break;
    }

    case "customer.updated": {
      const cust = event.data.object as Stripe.Customer;
      const companyId = await findCompanyByStripeCustomerId(cust.id);
      if (!companyId) return;
      const defaultPmId = cust.invoice_settings?.default_payment_method;
      const defaultPmIdResolved =
        typeof defaultPmId === "string" ? defaultPmId : defaultPmId?.id ?? null;
      if (defaultPmIdResolved) {
        const pm = await stripe.paymentMethods.retrieve(defaultPmIdResolved);
        await cachePaymentMethod(companyId, pm);
      } else {
        await cachePaymentMethod(companyId, null);
      }
      break;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
      if (!customerId) return;
      const companyId = await findCompanyByStripeCustomerId(customerId);
      if (!companyId) return;

      let declineCode: string | null = null;
      let declineMessage: string | null = null;
      if (event.type === "invoice.payment_failed") {
        const reason = await extractInvoiceDeclineReason(stripe, inv);
        declineCode = reason.code;
        declineMessage = reason.message;
      }

      await prisma.activityLogEntry.create({
        data: {
          companyId,
          action:
            event.type === "invoice.paid"
              ? "billing_invoice_paid"
              : "billing_invoice_payment_failed",
          entity: "Invoice",
          entityId: inv.id,
          message: `Invoice ${inv.number || inv.id} ${event.type === "invoice.paid" ? "paid" : "failed"}`,
          meta: {
            amountCents: inv.amount_due ?? inv.amount_paid ?? 0,
            currency: inv.currency,
            hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
            declineCode,
            declineMessage,
          },
        },
      });
      // Most-recent billing-invoice activity drives the badge — push so
      // the issue clears (or appears) for connected clients immediately.
      publishBillingChanged(companyId);

      // Once a subscription is already unhealthy, additional retry failures
      // don't trigger a new subscription.updated transition — fire a per-
      // invoice alert so admins still hear about each failed retry. (The
      // initial transition into the unhealthy state is handled by the
      // subscription.updated branch above to avoid double-emailing.)
      if (event.type === "invoice.payment_failed") {
        const sub = await prisma.subscription.findUnique({
          where: { companyId },
          select: { status: true },
        });
        if (isUnhealthyStatus(sub?.status)) {
          await notifyAdminsOfBillingIssue({
            companyId,
            status: sub!.status,
            declineCode,
            declineMessage,
            // Per-invoice dedupe so retried webhook deliveries for the same
            // invoice don't re-email, but a fresh retry attempt does.
            dedupeBucket: inv.id ?? `invoice:${event.id}`,
          }).catch((err) =>
            console.warn("[stripe/webhook] billing invoice-failed alert failed", err)
          );
        }
      }
      break;
    }
  }
}

