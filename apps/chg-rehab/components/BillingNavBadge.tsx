"use client";

import { useBillingHealth } from "@/lib/useBillingHealth";

/**
 * Read-only billing health badge for non-admin teammates. Mirrors the visual
 * style of <BillingNavIndicator /> but does not link anywhere — non-admins
 * can't access Admin → Billing & plan, so it shows a tooltip telling them to
 * contact an admin instead.
 *
 * Subscribes to the shared `useBillingHealth` store so we don't open an
 * extra `/api/billing/stream` EventSource alongside the one already running
 * for the gated trigger buttons on the page.
 */
export default function BillingNavBadge() {
  const { hasIssue } = useBillingHealth();

  if (!hasIssue) return null;

  const tooltip = "Account billing problem — contact your admin";

  return (
    <span
      role="status"
      title={tooltip}
      aria-label={tooltip}
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
        whiteSpace: "nowrap",
        lineHeight: 1,
        cursor: "default",
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
    </span>
  );
}
