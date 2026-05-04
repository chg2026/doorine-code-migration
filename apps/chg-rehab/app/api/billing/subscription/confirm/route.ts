import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  fetchLatestInvoiceClientSecret,
  isStripeConfigured,
  loadOrCreateSubscription,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Return the client_secret of the latest invoice's PaymentIntent for the
 * company's existing Stripe subscription. The BillingPanel uses this to
 * recover a subscription stuck in `incomplete` (or `incomplete_expired`)
 * without forcing the admin to re-pick a plan.
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
    return NextResponse.json(
      { error: "No active subscription to confirm" },
      { status: 400 }
    );
  if (sub.status !== "incomplete" && sub.status !== "incomplete_expired")
    return NextResponse.json(
      { error: `Subscription is ${sub.status}, no payment confirmation needed` },
      { status: 400 }
    );

  const clientSecret = await fetchLatestInvoiceClientSecret(user.companyId);
  if (!clientSecret)
    return NextResponse.json(
      {
        error:
          "Stripe didn't return a payment intent for the latest invoice. Try changing plans to start a fresh checkout.",
      },
      { status: 409 }
    );

  return NextResponse.json({ clientSecret });
}
