import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  type PlanTier,
  countSeatsInUse,
  extractLatestInvoiceClientSecret,
  getOrCreateStripeCustomer,
  getPlanPriceId,
  isPlanTier,
  isStripeConfigured,
  loadOrCreateSubscription,
  requireStripe,
  syncFromStripeSubscription,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Create or update the company's Stripe Subscription to a target plan. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  if (!isPlanTier(body.plan))
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  const plan: PlanTier = body.plan;

  const priceId = getPlanPriceId(plan);
  if (!priceId)
    return NextResponse.json(
      { error: `Stripe price for ${plan} not configured (set STRIPE_PRICE_${plan.toUpperCase()})` },
      { status: 503 }
    );

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  const customerId = await getOrCreateStripeCustomer(user.companyId, {
    email: user.email,
    name: company?.name ?? null,
  });
  const stripe = requireStripe();
  const localSub = await loadOrCreateSubscription(user.companyId);
  // Per-seat pricing: invoice quantity tracks the live seat count (active
  // users + still-pending invites). Always at least 1 so Stripe accepts the
  // line item even on a brand-new tenant.
  const quantity = Math.max(1, await countSeatsInUse(user.companyId));

  let stripeSub;
  if (localSub.stripeSubscriptionId) {
    // Update existing — swap the price on the first item and refresh quantity.
    const existing = await stripe.subscriptions.retrieve(localSub.stripeSubscriptionId);
    const itemId = existing.items.data[0]?.id;
    if (!itemId)
      return NextResponse.json(
        { error: "Stripe subscription has no items" },
        { status: 500 }
      );
    stripeSub = await stripe.subscriptions.update(localSub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId, quantity }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
      expand: [
        "items.data.price.product",
        "default_payment_method",
        "latest_invoice.confirmation_secret",
        "latest_invoice.payment_intent",
      ],
    });
  } else {
    // Create new. Requires a default PM on the customer for charge_automatically.
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPm =
      customer && !("deleted" in customer && customer.deleted)
        ? customer.invoice_settings?.default_payment_method
        : null;
    if (!defaultPm) {
      return NextResponse.json(
        { error: "Add a payment method before activating a plan" },
        { status: 400 }
      );
    }
    stripeSub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId, quantity }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: [
        "items.data.price.product",
        "default_payment_method",
        "latest_invoice.confirmation_secret",
        "latest_invoice.payment_intent",
      ],
      metadata: { companyId: user.companyId, plan },
    });
  }

  const synced = await syncFromStripeSubscription(user.companyId, stripeSub);
  // When the new subscription is `incomplete`, the first invoice's
  // PaymentIntent must be confirmed in the browser via Stripe.js. Surface
  // the client_secret so the BillingPanel can drive that confirmation
  // (including 3DS / SCA when required).
  const latestInvoiceClientSecret = needsClientConfirmation(stripeSub.status)
    ? extractLatestInvoiceClientSecret(stripeSub)
    : null;

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "billing_plan_changed",
      entity: "Subscription",
      entityId: synced.id,
      message: `Plan changed to ${plan}`,
      meta: { plan, stripeSubscriptionId: stripeSub.id, status: stripeSub.status },
    },
  });

  return NextResponse.json({
    ok: true,
    plan: synced.plan,
    status: synced.status,
    seatLimit: synced.seatLimit,
    latestInvoiceClientSecret,
  });
}

function needsClientConfirmation(status: string): boolean {
  return status === "incomplete" || status === "incomplete_expired";
}

/** Cancel at period end. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const sub = await loadOrCreateSubscription(user.companyId);
  if (!sub.stripeSubscriptionId)
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });

  const stripe = requireStripe();
  const stripeSub = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
    expand: ["items.data.price.product", "default_payment_method"],
  });
  await syncFromStripeSubscription(user.companyId, stripeSub);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "billing_plan_canceled",
      entity: "Subscription",
      entityId: sub.id,
      message: "Subscription set to cancel at period end",
    },
  });

  return NextResponse.json({ ok: true });
}

