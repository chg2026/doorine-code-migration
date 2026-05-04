"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";

type PlanTier = "Starter" | "Operator" | "Enterprise";

type PlanInfo = {
  seatLimit: number;
  pricePerSeatCents: number;
  description: string;
};

type Subscription = {
  plan: PlanTier;
  status: string;
  seatLimit: number;
  seatsInUse: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentMethod: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  } | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type BillingConfig = {
  configured: boolean;
  publishableKey: string | null;
  pricesConfigured: { Starter: boolean; Operator: boolean; Enterprise: boolean };
};

type PaymentIssue = {
  reason: "past_due" | "unpaid" | "invoice_failed";
  invoiceId: string | null;
  message: string | null;
  failedAt: string | null;
  hostedInvoiceUrl: string | null;
  declineCode: string | null;
  declineMessage: string | null;
};

type BillingState = {
  config: BillingConfig;
  plans: Record<PlanTier, PlanInfo>;
  subscription: Subscription;
  paymentIssue: PaymentIssue | null;
};

type Invoice = {
  id: string;
  date: string | null;
  amountCents: number;
  currency: string;
  status: "Paid" | "Open" | "Void";
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  declineCode: string | null;
  declineMessage: string | null;
};

const PLAN_ORDER: PlanTier[] = ["Starter", "Operator", "Enterprise"];

function formatCents(cents: number, currency = "usd") {
  const amt = (cents / 100).toFixed(2);
  return currency.toLowerCase() === "usd" ? `$${amt}` : `${amt} ${currency.toUpperCase()}`;
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 20 }}>{children}</h2>;
}

export default function BillingPanel({
  isAdmin,
  companyName,
  onToast,
}: {
  isAdmin: boolean;
  companyName: string;
  onToast: (msg: string) => void;
}) {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [savingPlan, setSavingPlan] = useState<PlanTier | null>(null);
  const [editingPm, setEditingPm] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const fetchSeqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);
  const invoicesSeqRef = useRef(0);
  const latestAppliedInvoicesSeqRef = useRef(0);

  const fetchBilling = useCallback(async (): Promise<BillingState | null> => {
    const seq = ++fetchSeqRef.current;
    const res = await fetch("/api/billing", { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as BillingState;
    if (seq < latestAppliedSeqRef.current) return null;
    latestAppliedSeqRef.current = seq;
    setState(data);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetchBilling();
    } catch (err) {
      onToast("Couldn't load billing data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fetchBilling, onToast]);

  const silentRefresh = useCallback(async () => {
    try {
      await fetchBilling();
    } catch (err) {
      console.error(err);
    }
  }, [fetchBilling]);

  const fetchInvoices = useCallback(async (): Promise<Invoice[] | null> => {
    const seq = ++invoicesSeqRef.current;
    const res = await fetch("/api/billing/invoices", { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { invoices: Invoice[] };
    if (seq < latestAppliedInvoicesSeqRef.current) return null;
    latestAppliedInvoicesSeqRef.current = seq;
    setInvoices(data.invoices);
    return data.invoices;
  }, []);

  const refreshInvoices = useCallback(async () => {
    try {
      await fetchInvoices();
    } catch {
      setInvoices([]);
    }
  }, [fetchInvoices]);

  const silentRefreshInvoices = useCallback(async () => {
    try {
      await fetchInvoices();
    } catch (err) {
      console.error(err);
    }
  }, [fetchInvoices]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const scrolledToIssueRef = useRef(false);
  useEffect(() => {
    if (scrolledToIssueRef.current) return;
    if (!state?.paymentIssue) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#billing-payment-issue") return;
    scrolledToIssueRef.current = true;
    window.requestAnimationFrame(() => {
      const el = document.getElementById("billing-payment-issue");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [state?.paymentIssue]);

  useEffect(() => {
    if (state?.config.configured && state.subscription.stripeCustomerId) {
      refreshInvoices();
    } else {
      setInvoices([]);
    }
  }, [state?.config.configured, state?.subscription.stripeCustomerId, refreshInvoices]);

  useEffect(() => {
    if (!state?.config.configured) return;
    const POLL_MS = 15000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        silentRefresh();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        silentRefresh();
        start();
      } else {
        stop();
      }
    };
    start();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [state?.config.configured, silentRefresh]);

  useEffect(() => {
    if (!state?.config.configured) return;
    if (!state.subscription.stripeCustomerId) return;
    const POLL_MS = 15000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        silentRefreshInvoices();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        silentRefreshInvoices();
        start();
      } else {
        stop();
      }
    };
    start();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [state?.config.configured, state?.subscription.stripeCustomerId, silentRefreshInvoices]);

  const stripePromise = useMemo<Promise<StripeJs | null> | null>(() => {
    const pk = state?.config.publishableKey;
    if (!pk) return null;
    return loadStripe(pk);
  }, [state?.config.publishableKey]);

  if (loading || !state) {
    return (
      <div className="admin-panel active">
        <PanelTitle>Billing & plan</PanelTitle>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Loading…</div>
      </div>
    );
  }

  const { config, plans, subscription, paymentIssue } = state;

  const handleUpdateCard = () => {
    setEditingPm(true);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const el = document.getElementById("billing-payment-method");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  // Plain function (not useCallback) because this lives below an early return
  // for the loading state and would otherwise violate the rules of hooks.
  // None of its callers are memoized, so the useCallback was a no-op anyway.
  const confirmInvoicePayment = async (clientSecret: string): Promise<boolean> => {
    if (!stripePromise) {
      onToast("Stripe.js failed to load — refresh and try again");
      return false;
    }
    const stripeJs = await stripePromise;
    if (!stripeJs) {
      onToast("Stripe.js failed to load — refresh and try again");
      return false;
    }
    // The first invoice's PaymentIntent already has the customer's default
    // PaymentMethod attached server-side, so we just confirm it. Stripe.js
    // handles 3DS / SCA in-line via the popup it renders.
    const result = await stripeJs.confirmCardPayment(clientSecret);
    if (result.error) {
      onToast(result.error.message || "Payment confirmation failed");
      return false;
    }
    // Pull live Stripe state into our DB so the panel flips to "Active"
    // immediately, without waiting for the customer.subscription.updated
    // webhook to round-trip.
    try {
      await fetch("/api/billing/subscription/sync", { method: "POST" });
    } catch (err) {
      console.error(err);
    }
    return true;
  };

  const handlePlanChange = async (plan: PlanTier) => {
    if (!isAdmin) return;
    if (plan === subscription.plan) return;
    if (!config.configured) {
      onToast("Connect Stripe to change plans");
      return;
    }
    if (!config.pricesConfigured[plan]) {
      onToast(`Missing STRIPE_PRICE_${plan.toUpperCase()} env var`);
      return;
    }
    setSavingPlan(plan);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        latestInvoiceClientSecret?: string | null;
      };
      if (!res.ok) {
        onToast(body.error || "Plan change failed");
        return;
      }
      if (body.latestInvoiceClientSecret) {
        const confirmed = await confirmInvoicePayment(body.latestInvoiceClientSecret);
        if (!confirmed) {
          // Surface the stuck state so the admin can retry; refresh to pick
          // up whatever Stripe recorded (e.g. requires_action).
          await refresh();
          await refreshInvoices();
          return;
        }
      }
      onToast(`Plan changed to ${plan}`);
      await refresh();
      await refreshInvoices();
    } catch (err) {
      onToast("Plan change failed");
      console.error(err);
    } finally {
      setSavingPlan(null);
    }
  };

  const handleConfirmStuckPayment = async () => {
    if (!isAdmin || !config.configured) return;
    setConfirmingPayment(true);
    try {
      const res = await fetch("/api/billing/subscription/confirm", {
        method: "POST",
      });
      const body = (await res.json()) as {
        clientSecret?: string;
        error?: string;
      };
      if (!res.ok || !body.clientSecret) {
        onToast(body.error || "Couldn't start payment confirmation");
        return;
      }
      const confirmed = await confirmInvoicePayment(body.clientSecret);
      if (confirmed) onToast("Payment confirmed");
      await refresh();
      await refreshInvoices();
    } catch (err) {
      console.error(err);
      onToast("Payment confirmation failed");
    } finally {
      setConfirmingPayment(false);
    }
  };

  const removePm = async () => {
    if (!confirm("Remove the card on file?")) return;
    const res = await fetch("/api/billing/payment-method", { method: "DELETE" });
    if (res.ok) {
      onToast("Payment method removed");
      await refresh();
    } else {
      onToast("Couldn't remove card");
    }
  };

  const stuckOnPayment =
    subscription.status === "incomplete" || subscription.status === "incomplete_expired";

  return (
    <div className="admin-panel active">
      <PanelTitle>Billing & plan</PanelTitle>

      {paymentIssue && (
        <PaymentIssueBanner issue={paymentIssue} onUpdateCard={handleUpdateCard} />
      )}

      {!config.configured && <SetupPlaceholder />}

      {config.configured && stuckOnPayment && subscription.stripeSubscriptionId && (
        <div
          style={{
            border: "1px solid var(--red-bd, #fecaca)",
            background: "var(--red-bg, #fef2f2)",
            color: "var(--red-txt, #b42318)",
            borderRadius: 6,
            padding: 12,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 12, lineHeight: 1.5, flex: "1 1 320px" }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              Finish setting up your subscription
            </div>
            <div>
              Your subscription is on hold until the first invoice&apos;s payment is confirmed.
              {subscription.paymentMethod
                ? ` We'll charge ${(subscription.paymentMethod.brand || "your card")
                    .toString()
                    .toUpperCase()} ···· ${subscription.paymentMethod.last4}.`
                : " Add a card above first."}
            </div>
          </div>
          <button
            className="btn-sm"
            disabled={!isAdmin || confirmingPayment || !subscription.paymentMethod}
            onClick={handleConfirmStuckPayment}
          >
            {confirmingPayment ? "Confirming…" : "Confirm payment"}
          </button>
        </div>
      )}

      <div className="admin-group">
        <div className="admin-group-title">Current plan</div>
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">{companyName || "Account"}</div>
            <div className="admin-desc">{plans[subscription.plan].description}</div>
            <div className="admin-affects">
              {formatCents(plans[subscription.plan].pricePerSeatCents)}/seat · billed monthly · seat
              limit {subscription.seatLimit}
              {subscription.currentPeriodEnd && (
                <> · renews {subscription.currentPeriodEnd.slice(0, 10)}</>
              )}
              {subscription.cancelAtPeriodEnd && <> · cancels at period end</>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="proj-chip">{statusLabel(subscription.status)}</span>
            <select
              className="admin-select"
              value={subscription.plan}
              disabled={!isAdmin || !config.configured || savingPlan !== null}
              onChange={(e) => handlePlanChange(e.target.value as PlanTier)}
            >
              {PLAN_ORDER.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">Plan tiers</div>
            <div className="admin-desc">
              Seat caps and per-seat prices are set by the plan. Change plans above; Stripe handles
              proration.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {PLAN_ORDER.map((p) => {
                const info = plans[p];
                const active = p === subscription.plan;
                return (
                  <div
                    key={p}
                    style={{
                      border: active
                        ? "1px solid var(--text-primary)"
                        : "0.5px solid var(--border-lo)",
                      borderRadius: 6,
                      padding: 10,
                      minWidth: 160,
                      background: active ? "var(--bg-secondary)" : "var(--bg-primary)",
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{p}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {formatCents(info.pricePerSeatCents)}/seat · {info.seatLimit} seats
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {info.description}
                    </div>
                    {!config.pricesConfigured[p] && (
                      <div
                        style={{ fontSize: 10, color: "var(--red-txt, #b42318)", marginTop: 4 }}
                      >
                        Price ID not configured
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <SeatUsageGroup subscription={subscription} plans={plans} />

      <PaymentMethodGroup
        isAdmin={isAdmin}
        configured={config.configured}
        subscription={subscription}
        editingPm={editingPm}
        setEditingPm={setEditingPm}
        stripePromise={stripePromise}
        onSaved={async () => {
          setEditingPm(false);
          await refresh();
        }}
        onRemove={removePm}
      />

      <InvoiceHistoryGroup
        configured={config.configured}
        invoices={invoices}
        onRefresh={refreshInvoices}
      />
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trial";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "incomplete":
    case "incomplete_expired":
      return "Incomplete";
    case "unpaid":
      return "Unpaid";
    case "paused":
      return "Paused";
    case "inactive":
      return "Inactive";
    default:
      return status;
  }
}

function formatDeclineReason(
  code: string | null,
  message: string | null,
): string | null {
  if (code) {
    const humanized = code.replace(/_/g, " ").toLowerCase();
    if (code === "card_declined" || code === "generic_decline") {
      return message?.trim() || "Card declined";
    }
    return `Card declined: ${humanized}`;
  }
  if (message && message.trim()) return message.trim();
  return null;
}

function PaymentIssueBanner({
  issue,
  onUpdateCard,
}: {
  issue: PaymentIssue;
  onUpdateCard: () => void;
}) {
  const headline =
    issue.reason === "past_due"
      ? "Your subscription is past due"
      : issue.reason === "unpaid"
        ? "Your subscription is unpaid"
        : "Your last invoice payment failed";

  const body =
    issue.reason === "past_due" || issue.reason === "unpaid"
      ? "Stripe couldn't charge the card on file. Update the card to keep your subscription active and avoid losing access."
      : "Stripe could not charge the card on file for the most recent invoice. Update the card on file so the next retry succeeds.";

  const failedAtLabel = issue.failedAt ? new Date(issue.failedAt).toLocaleString() : null;
  const declineReason = formatDeclineReason(issue.declineCode, issue.declineMessage);

  return (
    <div
      id="billing-payment-issue"
      role="alert"
      style={{
        border: "1px solid #b42318",
        background: "#fef3f2",
        color: "#7a1c14",
        borderRadius: 6,
        padding: 14,
        marginBottom: 20,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{headline}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>{body}</div>
        {declineReason && (
          <div style={{ fontSize: 12, marginTop: 6, fontWeight: 500 }}>
            Reason: {declineReason}
          </div>
        )}
        {(issue.message || failedAtLabel) && (
          <div style={{ fontSize: 11, marginTop: 6, color: "#7a1c14", opacity: 0.85 }}>
            {issue.message}
            {issue.message && failedAtLabel ? " · " : ""}
            {failedAtLabel ? `Reported ${failedAtLabel}` : ""}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
        {issue.hostedInvoiceUrl && (
          <a
            className="btn-sm"
            href={issue.hostedInvoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#fff",
              color: "#b42318",
              border: "1px solid #b42318",
              textDecoration: "none",
            }}
          >
            View invoice
          </a>
        )}
        <button
          className="btn-sm"
          onClick={onUpdateCard}
          style={{
            background: "#b42318",
            color: "#fff",
            border: "1px solid #b42318",
          }}
        >
          Update card
        </button>
      </div>
    </div>
  );
}

function SetupPlaceholder() {
  return (
    <div
      style={{
        border: "1px dashed var(--border-lo)",
        borderRadius: 6,
        padding: 14,
        marginBottom: 20,
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Connect Stripe</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Add the following secrets in your Replit Secrets pane to enable real billing:
      </div>
      <ul
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          marginTop: 6,
          paddingLeft: 16,
          lineHeight: 1.6,
        }}
      >
        <li>
          <code>STRIPE_SECRET_KEY</code> — your Stripe secret key (sk_test_… or sk_live_…)
        </li>
        <li>
          <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> — publishable key for Stripe Elements
        </li>
        <li>
          <code>STRIPE_WEBHOOK_SECRET</code> — signing secret for the{" "}
          <code>/api/stripe/webhook</code> endpoint
        </li>
        <li>
          <code>STRIPE_PRICE_STARTER</code>, <code>STRIPE_PRICE_OPERATOR</code>,{" "}
          <code>STRIPE_PRICE_ENTERPRISE</code> — Stripe Price IDs for each plan tier (run{" "}
          <code>npx tsx scripts/seed-stripe-products.ts</code> to create them)
        </li>
      </ul>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
        Plan changes, card capture, and live invoices stay disabled until these keys are set. Seat
        limits still apply right now using the default cap for the company&apos;s current plan tier.
      </div>
    </div>
  );
}

function SeatUsageGroup({
  subscription,
  plans,
}: {
  subscription: Subscription;
  plans: Record<PlanTier, PlanInfo>;
}) {
  const seatPct =
    subscription.seatLimit > 0
      ? Math.min(100, Math.round((subscription.seatsInUse / subscription.seatLimit) * 100))
      : 0;
  const overSeat = subscription.seatsInUse > subscription.seatLimit;
  const monthlyTotal = formatCents(
    plans[subscription.plan].pricePerSeatCents * Math.max(0, subscription.seatsInUse)
  );
  return (
    <div className="admin-group">
      <div className="admin-group-title">Seat usage</div>
      <div className="admin-row">
        <div className="admin-info">
          <div className="admin-lbl">
            {subscription.seatsInUse} of {subscription.seatLimit} seats in use
          </div>
          <div className="admin-desc">
            Counted from active users + pending invites. New invites are blocked once the cap is
            reached. Estimated next invoice: {monthlyTotal}.
          </div>
          {overSeat && (
            <div className="admin-affects" style={{ color: "var(--red-txt, #b42318)" }}>
              Over the seat limit. Upgrade your plan or remove unused users.
            </div>
          )}
          <div
            style={{
              marginTop: 8,
              width: 240,
              height: 6,
              background: "var(--bg-secondary)",
              borderRadius: 3,
              overflow: "hidden",
              border: "0.5px solid var(--border-lo)",
            }}
          >
            <div
              style={{
                width: `${seatPct}%`,
                height: "100%",
                background: overSeat ? "#b42318" : "var(--text-secondary)",
              }}
            />
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{seatPct}%</div>
      </div>
    </div>
  );
}

function PaymentMethodGroup({
  isAdmin,
  configured,
  subscription,
  editingPm,
  setEditingPm,
  stripePromise,
  onSaved,
  onRemove,
}: {
  isAdmin: boolean;
  configured: boolean;
  subscription: Subscription;
  editingPm: boolean;
  setEditingPm: (v: boolean) => void;
  stripePromise: Promise<StripeJs | null> | null;
  onSaved: () => void;
  onRemove: () => void;
}) {
  const pm = subscription.paymentMethod;
  const expLabel =
    pm?.expMonth && pm?.expYear
      ? `${String(pm.expMonth).padStart(2, "0")}/${String(pm.expYear).slice(-2)}`
      : "—";
  return (
    <div className="admin-group" id="billing-payment-method">
      <div className="admin-group-title">Payment method</div>
      {!editingPm && pm && (
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">
              {(pm.brand || "Card").toString().toUpperCase()} ···· {pm.last4}
            </div>
            <div className="admin-desc">Expires {expLabel}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn-sm"
              disabled={!isAdmin || !configured}
              onClick={() => setEditingPm(true)}
            >
              Update
            </button>
            <button
              className="btn-sm"
              disabled={!isAdmin || !configured}
              onClick={onRemove}
            >
              Remove
            </button>
          </div>
        </div>
      )}
      {!editingPm && !pm && (
        <div className="admin-row">
          <div className="admin-info">
            <div className="admin-lbl">No card on file</div>
            <div className="admin-desc">
              {configured
                ? "Add a card via Stripe to activate or change your subscription. Only the card brand, last four digits, and expiry are stored locally for display."
                : "Connect Stripe (above) to add a card."}
            </div>
          </div>
          <button
            className="btn-sm"
            disabled={!isAdmin || !configured}
            onClick={() => setEditingPm(true)}
          >
            Add card
          </button>
        </div>
      )}
      {editingPm && configured && stripePromise && (
        <Elements stripe={stripePromise}>
          <CardEditor onSaved={onSaved} onCancel={() => setEditingPm(false)} />
        </Elements>
      )}
      {editingPm && (!configured || !stripePromise) && (
        <div className="admin-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Stripe is not connected — set the env vars above to enable card capture.
          </div>
          <button
            className="btn-sm"
            style={{ marginTop: 6, alignSelf: "flex-start" }}
            onClick={() => setEditingPm(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function CardEditor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const intentRes = await fetch("/api/billing/setup-intent", { method: "POST" });
      const intentBody = (await intentRes.json()) as {
        clientSecret?: string;
        error?: string;
      };
      if (!intentRes.ok || !intentBody.clientSecret) {
        setError(intentBody.error || "Couldn't start card capture");
        setSubmitting(false);
        return;
      }
      const card = elements.getElement(CardElement);
      if (!card) {
        setError("Card field missing");
        setSubmitting(false);
        return;
      }
      const result = await stripe.confirmCardSetup(intentBody.clientSecret, {
        payment_method: { card },
      });
      if (result.error) {
        setError(result.error.message || "Card capture failed");
        setSubmitting(false);
        return;
      }
      const setupIntent = result.setupIntent;
      const pmId =
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;
      if (!pmId) {
        setError("Stripe didn't return a payment method id");
        setSubmitting(false);
        return;
      }
      const saveRes = await fetch("/api/billing/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: pmId }),
      });
      const saveBody = (await saveRes.json()) as { ok?: boolean; error?: string };
      if (!saveRes.ok) {
        setError(saveBody.error || "Couldn't attach card");
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (err) {
      console.error(err);
      setError("Card capture failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div
        style={{
          border: "0.5px solid var(--border-lo)",
          borderRadius: 6,
          padding: 12,
          background: "var(--bg-primary)",
        }}
      >
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "13px",
                color: "var(--text-primary, #0f172a)",
                "::placeholder": { color: "#94a3b8" },
              },
            },
          }}
        />
      </div>
      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--red-txt, #b42318)" }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn-sm" disabled={!stripe || submitting} onClick={submit}>
          {submitting ? "Saving…" : "Save card"}
        </button>
        <button className="btn-sm" disabled={submitting} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="admin-desc" style={{ marginTop: 6 }}>
        Card data goes directly to Stripe. Only brand, last 4 digits, and expiry are stored on
        this server for display.
      </div>
    </div>
  );
}

function InvoiceHistoryGroup({
  configured,
  invoices,
  onRefresh,
}: {
  configured: boolean;
  invoices: Invoice[] | null;
  onRefresh: () => void;
}) {
  return (
    <div className="admin-group">
      <div
        className="admin-group-title"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span>Invoice history</span>
        {configured && (
          <button className="btn-sm" onClick={onRefresh}>
            Refresh
          </button>
        )}
      </div>
      {!configured && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "12px 0" }}>
          Connect Stripe to see live invoice history.
        </div>
      )}
      {configured && invoices === null && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "12px 0" }}>
          Loading invoices…
        </div>
      )}
      {configured && invoices && invoices.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "12px 0" }}>
          No invoices yet. Once your first billing cycle closes, invoices will appear here.
        </div>
      )}
      {configured && invoices && invoices.length > 0 && (
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
              <th style={{ padding: "6px 0", fontWeight: 500 }}>Invoice</th>
              <th style={{ padding: "6px 0", fontWeight: 500 }}>Date</th>
              <th style={{ padding: "6px 0", fontWeight: 500, textAlign: "right" }}>Amount</th>
              <th style={{ padding: "6px 0", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "6px 0", fontWeight: 500, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const declineReason =
                inv.status === "Open"
                  ? formatDeclineReason(inv.declineCode, inv.declineMessage)
                  : null;
              return (
                <tr key={inv.id} style={{ borderTop: "0.5px solid var(--border-lo)" }}>
                  <td style={{ padding: "8px 0", verticalAlign: "top" }}>{inv.id}</td>
                  <td style={{ padding: "8px 0", verticalAlign: "top" }}>{inv.date ?? "—"}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", verticalAlign: "top" }}>
                    {formatCents(inv.amountCents, inv.currency)}
                  </td>
                  <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                    <span className="proj-chip">{inv.status}</span>
                    {declineReason && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--red-txt, #b42318)",
                          marginTop: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        Reason: {declineReason}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", verticalAlign: "top" }}>
                    {inv.hostedInvoiceUrl && (
                      <a
                        className="btn-sm"
                        style={{ textDecoration: "none" }}
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
