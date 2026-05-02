import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PLAN_DEFAULTS,
  countSeatsInUse,
  getPublicBillingConfig,
  loadOrCreateSubscription,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sub = await loadOrCreateSubscription(user.companyId);
  const seatsInUse = await countSeatsInUse(user.companyId);
  const config = getPublicBillingConfig();

  const lastBillingActivity = await prisma.activityLogEntry.findFirst({
    where: {
      companyId: user.companyId,
      action: { in: ["billing_invoice_paid", "billing_invoice_payment_failed"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      action: true,
      entityId: true,
      message: true,
      createdAt: true,
      meta: true,
    },
  });

  const statusFailureReason =
    sub.status === "past_due" || sub.status === "unpaid" ? sub.status : null;
  const lastInvoiceFailed =
    lastBillingActivity?.action === "billing_invoice_payment_failed";

  const lastInvoiceMeta =
    lastInvoiceFailed && lastBillingActivity?.meta &&
    typeof lastBillingActivity.meta === "object" &&
    !Array.isArray(lastBillingActivity.meta)
      ? (lastBillingActivity.meta as Record<string, unknown>)
      : null;
  const hostedInvoiceUrl =
    lastInvoiceMeta && typeof lastInvoiceMeta.hostedInvoiceUrl === "string"
      ? lastInvoiceMeta.hostedInvoiceUrl
      : null;
  const declineCode =
    lastInvoiceMeta && typeof lastInvoiceMeta.declineCode === "string"
      ? lastInvoiceMeta.declineCode
      : null;
  const declineMessage =
    lastInvoiceMeta && typeof lastInvoiceMeta.declineMessage === "string"
      ? lastInvoiceMeta.declineMessage
      : null;

  const paymentIssue = statusFailureReason || lastInvoiceFailed
    ? {
        reason: statusFailureReason ?? "invoice_failed",
        invoiceId: lastInvoiceFailed ? lastBillingActivity?.entityId ?? null : null,
        message: lastInvoiceFailed ? lastBillingActivity?.message ?? null : null,
        failedAt: lastInvoiceFailed
          ? lastBillingActivity?.createdAt.toISOString() ?? null
          : null,
        hostedInvoiceUrl: lastInvoiceFailed ? hostedInvoiceUrl : null,
        declineCode: lastInvoiceFailed ? declineCode : null,
        declineMessage: lastInvoiceFailed ? declineMessage : null,
      }
    : null;

  return NextResponse.json({
    config,
    plans: PLAN_DEFAULTS,
    subscription: {
      plan: sub.plan,
      status: sub.status,
      seatLimit: sub.seatLimit,
      seatsInUse,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      paymentMethod: sub.paymentMethodLast4
        ? {
            brand: sub.paymentMethodBrand,
            last4: sub.paymentMethodLast4,
            expMonth: sub.paymentMethodExpMonth,
            expYear: sub.paymentMethodExpYear,
          }
        : null,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
    },
    paymentIssue,
  });
}
