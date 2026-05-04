"use client";

import Link from "next/link";
import { useBillingHealth } from "@/lib/useBillingHealth";

function describeReason(reason: string): string {
  switch (reason) {
    case "past_due":
      return "Subscription past due";
    case "unpaid":
      return "Subscription unpaid";
    case "invoice_failed":
      return "Last invoice payment failed";
    default:
      return "Billing problem";
  }
}

/**
 * Admin-only top-nav billing indicator. Subscribes to the shared
 * `useBillingHealth` store so it shares one `/api/billing/stream`
 * EventSource (and one fallback poll) with the gated trigger buttons on
 * the page — instead of opening its own dedicated SSE connection.
 *
 * Renders only when the detailed admin-only payload from `/api/billing`
 * is present, matching the pre-consolidation behaviour exactly (we
 * intentionally don't fall back to the boolean `hasIssue` flag, otherwise
 * the indicator could briefly flash a generic label before the detailed
 * reason lands).
 */
export default function BillingNavIndicator() {
  const { paymentIssue } = useBillingHealth();

  if (!paymentIssue) return null;

  const label = describeReason(paymentIssue.reason);

  return (
    <Link
      href="/admin?panel=billing#billing-payment-issue"
      title={`${label} — open Billing & plan`}
      aria-label={`${label} — open Billing & plan`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        height: 28,
        borderRadius: 14,
        background: "#b42318",
        color: "#fff",
        fontSize: 11,
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#fff",
        }}
      />
      Billing problem
    </Link>
  );
}
