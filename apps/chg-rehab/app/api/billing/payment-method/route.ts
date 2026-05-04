import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  cachePaymentMethod,
  getOrCreateStripeCustomer,
  isStripeConfigured,
  loadOrCreateSubscription,
  requireStripe,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Attach a Stripe PaymentMethod to the customer and set it as the default. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { paymentMethodId?: string };
  const pmId = body.paymentMethodId;
  if (!pmId) return NextResponse.json({ error: "paymentMethodId required" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  const customerId = await getOrCreateStripeCustomer(user.companyId, {
    email: user.email,
    name: company?.name ?? null,
  });
  const stripe = requireStripe();

  // Attach PM to the customer (idempotent — Stripe ignores re-attach to same customer).
  let pm = await stripe.paymentMethods.retrieve(pmId);
  if (pm.customer && pm.customer !== customerId) {
    return NextResponse.json(
      { error: "Payment method belongs to a different customer" },
      { status: 400 }
    );
  }
  if (!pm.customer) {
    pm = await stripe.paymentMethods.attach(pmId, { customer: customerId });
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pmId },
  });

  // If a subscription already exists, point its default PM at this card too.
  const sub = await loadOrCreateSubscription(user.companyId);
  if (sub.stripeSubscriptionId) {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      default_payment_method: pmId,
    });
  }

  await cachePaymentMethod(user.companyId, pm);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "billing_payment_method_updated",
      entity: "Subscription",
      entityId: sub.id,
      meta: { brand: pm.card?.brand, last4: pm.card?.last4 },
    },
  });

  return NextResponse.json({ ok: true });
}

/** Detach the current default PM (if any). */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const sub = await loadOrCreateSubscription(user.companyId);
  if (!sub.defaultPaymentMethodId) return NextResponse.json({ ok: true });

  const stripe = requireStripe();
  try {
    await stripe.paymentMethods.detach(sub.defaultPaymentMethodId);
  } catch (e) {
    // Already detached — fine.
  }

  await cachePaymentMethod(user.companyId, null);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "billing_payment_method_removed",
      entity: "Subscription",
      entityId: sub.id,
    },
  });

  return NextResponse.json({ ok: true });
}
