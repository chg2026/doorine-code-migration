import Stripe from "stripe";
import { prisma } from "./prisma";
import type { Subscription as DbSubscription } from "@prisma/client";

export type PlanTier = "Starter" | "Operator" | "Enterprise";

export const PLAN_DEFAULTS: Record<
  PlanTier,
  { seatLimit: number; pricePerSeatCents: number; description: string }
> = {
  Starter: {
    seatLimit: 5,
    pricePerSeatCents: 2900,
    description: "Core PM + Documents Hub. Up to 5 active projects.",
  },
  Operator: {
    seatLimit: 25,
    pricePerSeatCents: 4900,
    description: "All modules, unlimited projects, contractor portal.",
  },
  Enterprise: {
    seatLimit: 250,
    pricePerSeatCents: 9900,
    description: "SSO, audit log export, dedicated support.",
  },
};

export function isPlanTier(v: unknown): v is PlanTier {
  return v === "Starter" || v === "Operator" || v === "Enterprise";
}

let _stripe: Stripe | null = null;
let _stripeKey: string | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Lazily construct (and cache) a Stripe client. Returns null if the
 * STRIPE_SECRET_KEY env var is missing — callers should check
 * `isStripeConfigured()` first and surface a clear setup-required state.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (_stripe && _stripeKey === key) return _stripe;
  // Pin to the SDK's bundled API version (avoids drift between SDK upgrades).
  _stripe = new Stripe(key);
  _stripeKey = key;
  return _stripe;
}

export function requireStripe(): Stripe {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured (set STRIPE_SECRET_KEY)");
  return s;
}

/** Map a plan tier → Stripe Price ID via env vars. Set per environment. */
export function getPlanPriceId(plan: PlanTier): string | null {
  const map: Record<PlanTier, string | undefined> = {
    Starter: process.env.STRIPE_PRICE_STARTER,
    Operator: process.env.STRIPE_PRICE_OPERATOR,
    Enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  };
  return map[plan] || null;
}

export function getPlanForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "Starter";
  if (priceId === process.env.STRIPE_PRICE_OPERATOR) return "Operator";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "Enterprise";
  return null;
}

/** Load (or lazily create) the company's Subscription row. */
export async function loadOrCreateSubscription(companyId: string): Promise<DbSubscription> {
  let sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub) {
    sub = await prisma.subscription.create({
      data: { companyId, plan: "Operator", seatLimit: PLAN_DEFAULTS.Operator.seatLimit },
    });
  }
  return sub;
}

/**
 * Returns true if the company currently has an active billing problem worth
 * surfacing in the UI (subscription past_due/unpaid, or the most recent
 * invoice activity was a payment failure). Read-only and safe for any
 * authenticated teammate to call — no sensitive billing details are exposed.
 */
export async function companyHasBillingIssue(companyId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { companyId },
    select: { status: true },
  });
  if (sub && (sub.status === "past_due" || sub.status === "unpaid")) {
    return true;
  }
  const lastBillingActivity = await prisma.activityLogEntry.findFirst({
    where: {
      companyId,
      action: { in: ["billing_invoice_paid", "billing_invoice_payment_failed"] },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  return lastBillingActivity?.action === "billing_invoice_payment_failed";
}

/**
 * Find or create the Stripe Customer for a company. Saves the customer id on
 * the Subscription row.
 */
export async function getOrCreateStripeCustomer(
  companyId: string,
  opts: { email?: string | null; name?: string | null }
): Promise<string> {
  const stripe = requireStripe();
  const sub = await loadOrCreateSubscription(companyId);
  if (sub.stripeCustomerId) {
    // Verify the customer still exists in Stripe (covers test-mode wipes).
    try {
      const c = await stripe.customers.retrieve(sub.stripeCustomerId);
      if (c && !("deleted" in c && c.deleted)) return sub.stripeCustomerId;
    } catch {
      // fall through, recreate
    }
  }
  const customer = await stripe.customers.create({
    email: opts.email ?? undefined,
    name: opts.name ?? undefined,
    metadata: { companyId },
  });
  await prisma.subscription.update({
    where: { companyId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Sync local Subscription row from a Stripe Subscription object. Called from
 * the webhook handler and after direct API actions.
 */
export async function syncFromStripeSubscription(
  companyId: string,
  stripeSub: Stripe.Subscription
): Promise<DbSubscription> {
  const item = stripeSub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const productId =
    item?.price && typeof item.price.product === "string"
      ? item.price.product
      : item?.price?.product
        ? (item.price.product as Stripe.Product).id
        : null;

  // Try to derive plan tier: env-mapped first, then product metadata.plan.
  let plan = getPlanForPriceId(priceId);
  if (!plan && item?.price?.product && typeof item.price.product !== "string") {
    const meta = (item.price.product as Stripe.Product).metadata || {};
    if (isPlanTier(meta.plan)) plan = meta.plan;
  }
  if (!plan) plan = "Operator";

  const seatLimit = PLAN_DEFAULTS[plan].seatLimit;
  // In the current Stripe API, current_period_end lives on the subscription item.
  const periodEndUnix = item?.current_period_end ?? null;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  const defaultPmId =
    typeof stripeSub.default_payment_method === "string"
      ? stripeSub.default_payment_method
      : stripeSub.default_payment_method?.id ?? null;

  return prisma.subscription.update({
    where: { companyId },
    data: {
      plan,
      status: stripeSub.status,
      seatLimit,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: priceId,
      stripeProductId: productId,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      defaultPaymentMethodId: defaultPmId ?? undefined,
    },
  });
}

/**
 * Cache the brand/last4/exp from a Stripe PaymentMethod into the local
 * Subscription row for display. Never store the raw card data.
 */
export async function cachePaymentMethod(
  companyId: string,
  pm: Stripe.PaymentMethod | null
): Promise<void> {
  if (!pm || pm.type !== "card" || !pm.card) {
    await prisma.subscription.update({
      where: { companyId },
      data: {
        defaultPaymentMethodId: null,
        paymentMethodBrand: null,
        paymentMethodLast4: null,
        paymentMethodExpMonth: null,
        paymentMethodExpYear: null,
      },
    });
    return;
  }
  await prisma.subscription.update({
    where: { companyId },
    data: {
      defaultPaymentMethodId: pm.id,
      paymentMethodBrand: pm.card.brand,
      paymentMethodLast4: pm.card.last4,
      paymentMethodExpMonth: pm.card.exp_month,
      paymentMethodExpYear: pm.card.exp_year,
    },
  });
}

export async function findCompanyByStripeCustomerId(
  customerId: string
): Promise<string | null> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { companyId: true },
  });
  return sub?.companyId ?? null;
}

/** Count active seats: real (active) users + still-pending invites. */
export async function countSeatsInUse(companyId: string): Promise<number> {
  const [users, invites] = await Promise.all([
    prisma.user.count({ where: { companyId, active: true } }),
    prisma.invite.count({ where: { companyId, status: "Pending" } }),
  ]);
  return users + invites;
}

/**
 * Push the current seat count to Stripe as the subscription item quantity, so
 * the per-seat price is invoiced correctly. No-op when Stripe isn't
 * configured or the company has no live Stripe Subscription yet.
 *
 * Best-effort: returns false on any Stripe error so callers can fall back to
 * the local seat-limit guard without failing user-facing actions.
 */
export async function syncSeatQuantity(companyId: string): Promise<boolean> {
  if (!isStripeConfigured()) return false;
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub?.stripeSubscriptionId) return false;
  const stripe = requireStripe();
  try {
    const seats = Math.max(1, await countSeatsInUse(companyId));
    const live = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const item = live.items.data[0];
    if (!item) return false;
    if (item.quantity === seats) return true;
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: seats }],
      proration_behavior: "create_prorations",
    });
    await syncFromStripeSubscription(companyId, updated);
    return true;
  } catch (err) {
    console.error("[stripe] syncSeatQuantity failed", err);
    return false;
  }
}

/**
 * Pull the PaymentIntent client_secret out of a Stripe Subscription whose
 * `latest_invoice` was expanded with `confirmation_secret` (and/or the legacy
 * `payment_intent`). Used by the BillingPanel to confirm the first invoice's
 * payment in the browser when a freshly-created subscription is `incomplete`.
 *
 * Returns null when no client secret is available (e.g. the sub is already
 * active, or `latest_invoice` was not expanded on the request).
 */
export function extractLatestInvoiceClientSecret(
  stripeSub: Stripe.Subscription
): string | null {
  const latest = stripeSub.latest_invoice;
  if (!latest || typeof latest === "string") return null;
  // Newer Stripe API versions surface the PaymentIntent secret on the invoice
  // as `confirmation_secret.client_secret`.
  const invoice = latest as Stripe.Invoice & {
    confirmation_secret?: { client_secret?: string | null } | null;
    payment_intent?: Stripe.PaymentIntent | string | null;
  };
  const fromConfirmation = invoice.confirmation_secret?.client_secret;
  if (fromConfirmation) return fromConfirmation;
  // Older API versions exposed the PaymentIntent directly on the invoice.
  const pi = invoice.payment_intent;
  if (pi && typeof pi !== "string" && pi.client_secret) return pi.client_secret;
  return null;
}

/**
 * Fetch the live Stripe subscription for a company (with `latest_invoice`
 * expansion) so callers can recover the PaymentIntent client_secret for a
 * subscription stuck in `incomplete`. Returns null when there is no live
 * Stripe subscription on file.
 */
export async function fetchLatestInvoiceClientSecret(
  companyId: string
): Promise<string | null> {
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub?.stripeSubscriptionId) return null;
  const stripe = requireStripe();
  const live = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
    expand: [
      "latest_invoice.confirmation_secret",
      "latest_invoice.payment_intent",
    ],
  });
  return extractLatestInvoiceClientSecret(live);
}

/**
 * Try to surface a human-readable decline reason for a failed/open invoice.
 *
 * Walks the invoice's most recent failed payment attempt to pull
 * `last_payment_error` off the underlying PaymentIntent (preferred), or
 * falls back to the Charge's outcome / failure_message, then finally to
 * the invoice's `last_finalization_error`. All Stripe lookups are wrapped
 * in try/catch so a caller is never broken just because the enrichment
 * call fails — the function returns `{ code: null, message: null }` on
 * any error.
 *
 * Shared by the Stripe webhook (writes to ActivityLogEntry meta) and the
 * /api/billing/invoices listing (renders inline under each failed row).
 */
export async function extractInvoiceDeclineReason(
  stripe: Stripe,
  inv: Stripe.Invoice,
): Promise<{ code: string | null; message: string | null }> {
  let code: string | null = null;
  let message: string | null = null;

  try {
    if (inv.id) {
      const payments = await stripe.invoicePayments.list({
        invoice: inv.id,
        limit: 10,
        expand: ["data.payment.payment_intent.latest_charge"],
      });
      // Newest payment attempt first.
      const sorted = [...payments.data].sort((a, b) => b.created - a.created);
      const failed = sorted.find((p) => p.status !== "paid") ?? sorted[0];
      const pi =
        failed && typeof failed.payment.payment_intent === "object"
          ? failed.payment.payment_intent
          : null;
      const piErr = pi?.last_payment_error ?? null;
      if (piErr) {
        code = piErr.decline_code ?? piErr.code ?? null;
        message = piErr.message ?? null;
      }
      const latestCharge =
        pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
      if (latestCharge) {
        if (!message && latestCharge.outcome?.seller_message) {
          message = latestCharge.outcome.seller_message;
        }
        if (!code && latestCharge.failure_code) {
          code = latestCharge.failure_code;
        }
        if (!message && latestCharge.failure_message) {
          message = latestCharge.failure_message;
        }
      }
    }
  } catch (err) {
    console.warn("[stripe] failed to enrich invoice decline reason", err);
  }

  if (!message && inv.last_finalization_error) {
    message = inv.last_finalization_error.message ?? null;
    if (!code) code = inv.last_finalization_error.code ?? null;
  }

  return { code, message };
}

export type BillingPublicConfig = {
  configured: boolean;
  publishableKey: string | null;
  pricesConfigured: { Starter: boolean; Operator: boolean; Enterprise: boolean };
};

export function getPublicBillingConfig(): BillingPublicConfig {
  return {
    configured: isStripeConfigured(),
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
    pricesConfigured: {
      Starter: Boolean(process.env.STRIPE_PRICE_STARTER),
      Operator: Boolean(process.env.STRIPE_PRICE_OPERATOR),
      Enterprise: Boolean(process.env.STRIPE_PRICE_ENTERPRISE),
    },
  };
}
