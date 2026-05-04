"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type BillingSnapshot = {
  config: { configured: boolean };
  subscription: { status: string };
};

const UNHEALTHY_STATUSES = new Set([
  "past_due",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "canceled",
]);

const POLL_MS = 60_000;

function describe(status: string): { label: string; detail: string } {
  switch (status) {
    case "past_due":
      return {
        label: "Payment past due",
        detail:
          "Your last payment didn't go through. Update your card to keep your team's seats active.",
      };
    case "unpaid":
      return {
        label: "Subscription unpaid",
        detail:
          "Stripe couldn't collect payment after multiple attempts. Update billing to restore access.",
      };
    case "incomplete":
    case "incomplete_expired":
      return {
        label: "Subscription incomplete",
        detail:
          "Your subscription needs a working payment method to activate. Finish setup in billing.",
      };
    case "canceled":
      return {
        label: "Subscription canceled",
        detail:
          "Your subscription is canceled. Reactivate a plan to keep inviting and managing users.",
      };
    default:
      return {
        label: `Billing issue (${status})`,
        detail: "Open the billing panel to resolve this issue.",
      };
  }
}

export default function BillingStatusBanner() {
  const [status, setStatus] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as BillingSnapshot;
      setConfigured(Boolean(data.config?.configured));
      setStatus(data.subscription?.status ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  if (!configured || !status) return null;
  if (!UNHEALTHY_STATUSES.has(status)) return null;

  const { label, detail } = describe(status);

  return (
    <div
      role="alert"
      style={{
        background: "#fff4f4",
        borderBottom: "1px solid #f1c2c2",
        color: "#7a1f1f",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontWeight: 600 }}>{label}.</strong>{" "}
        <span style={{ color: "#5a1717" }}>{detail}</span>
      </div>
      <Link
        href="/admin?panel=billing"
        style={{
          background: "#a51b1b",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: 4,
          textDecoration: "none",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        Open billing
      </Link>
    </div>
  );
}
