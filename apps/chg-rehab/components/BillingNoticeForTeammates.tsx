"use client";

import { useCallback, useEffect, useState } from "react";
import { BILLING_REFRESH_EVENT } from "@/lib/billing-blocked-client";

// Long fallback poll only — the SSE stream at /api/billing/stream is the
// primary mechanism for keeping this banner in sync. Polling is a safety net
// for environments where the stream can't reach this client (multi-instance
// deploys, dropped EventSource that hasn't reconnected yet, etc).
const FALLBACK_POLL_MS = 5 * 60_000;

/**
 * Soft, informational billing banner shown to non-admin teammates when the
 * company subscription is unhealthy. Companion to <BillingStatusBanner />,
 * which is admin-only and exposes payment details + an "Open billing" CTA.
 *
 * This banner intentionally:
 *   - leaks no payment details (uses /api/billing/status, which only returns
 *     a `paymentIssue` boolean — safe for any authenticated teammate),
 *   - has no actionable CTA — non-admins can't access Admin → Billing & plan,
 *   - uses a softer amber palette (vs the admin banner's red) since the
 *     teammate can't act on it directly, only contact their admin,
 *   - hides itself when Stripe isn't configured or the subscription is
 *     healthy (relies on `companyHasBillingIssue`'s same logic the badge uses).
 *
 * Together with the inline `billingAwareErrorMessage` shown when a write
 * action is blocked, this gives non-admins enough context to know who to
 * ping instead of filing a support ticket.
 */
export default function BillingNoticeForTeammates() {
  const [hasIssue, setHasIssue] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) {
        setHasIssue(false);
        return;
      }
      const data = (await res.json()) as { paymentIssue?: boolean };
      setHasIssue(Boolean(data.paymentIssue));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, FALLBACK_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Subscribe to push notifications. The browser auto-reconnects an
    // EventSource on transient errors, so we don't need bespoke retry logic.
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/billing/stream");
      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data) as { type?: string };
          if (payload.type === "changed") load();
        } catch {
          /* ignore malformed frames */
        }
      };
    } catch {
      /* EventSource unavailable — fallback poll still covers us */
    }

    // Other components dispatch this event when they observe a
    // billing-blocked response so the banner can refresh immediately
    // instead of waiting up to 5 minutes for the next poll.
    window.addEventListener(BILLING_REFRESH_EVENT, load);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(BILLING_REFRESH_EVENT, load);
      es?.close();
    };
  }, [load]);

  if (!hasIssue) return null;

  return (
    <div
      role="status"
      style={{
        background: "#fff8e6",
        borderBottom: "1px solid #f1d59c",
        color: "#7a4a00",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>ⓘ</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontWeight: 600 }}>Your admin needs to update billing.</strong>{" "}
        <span style={{ color: "#5a3700" }}>
          Some actions (inviting teammates, creating projects, uploading documents)
          may be blocked until they fix it. Contact an admin on your team.
        </span>
      </div>
    </div>
  );
}
