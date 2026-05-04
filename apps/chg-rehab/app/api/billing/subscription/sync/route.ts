import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isStripeConfigured,
  loadOrCreateSubscription,
  requireStripe,
  syncFromStripeSubscription,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Pull the live Stripe subscription state into the local DB. The BillingPanel
 * calls this immediately after a successful client-side `confirmCardPayment`
 * so the row flips to `active` without waiting for the
 * `customer.subscription.updated` webhook.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const sub = await loadOrCreateSubscription(user.companyId);
  if (!sub.stripeSubscriptionId)
    return NextResponse.json({ ok: true, status: sub.status });

  const stripe = requireStripe();
  const live = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId, {
    expand: ["items.data.price.product", "default_payment_method"],
  });
  const synced = await syncFromStripeSubscription(user.companyId, live);

  return NextResponse.json({ ok: true, status: synced.status, plan: synced.plan });
}
