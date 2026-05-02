"use client";

import { useEffect, useState } from "react";
import { BILLING_REFRESH_EVENT } from "./billing-blocked-client";

/**
 * Shared client-side billing health snapshot used by:
 *   - `<BillingNavIndicator />` (admin-only nav badge that links to fix-it)
 *   - `<BillingNavBadge />`     (read-only nav badge for non-admin teammates)
 *   - trigger buttons (Add deal, Add property, Upload document, Assign
 *     contractor, etc.) so they can render in a disabled state up-front
 *     when the company has an active billing problem instead of waiting
 *     for the user to fill out a form and then bouncing them with the
 *     inline `billingAwareErrorMessage` copy.
 *
 * One module-level store + one SSE subscription + one fallback poll is
 * shared across every caller in the page so we don't open a fresh
 * EventSource per badge/button. Stays in sync across all consumers via
 * the same `billing:refresh` window event other components dispatch
 * when they observe a billing-blocked response.
 */
export type PaymentIssueDetail = {
  reason: string;
  invoiceId: string | null;
  message: string | null;
  failedAt: string | null;
} | null;

export type BillingHealth = {
  /** True until the first /api/billing/status response lands. */
  loading: boolean;
  /** True when the company currently has an active billing problem. */
  hasIssue: boolean;
  /** True when the current user is an Admin (admins keep access since
   * they are the ones who can fix it from Admin → Billing & plan). */
  isAdmin: boolean;
  /** True once the /api/auth/user response has resolved the role. Used to
   * avoid a brief "admin treated as non-admin" flicker if the billing
   * status response wins the race against the user-info response. */
  roleResolved: boolean;
  /**
   * Detailed payment-issue payload for admins (sourced from the admin-only
   * `/api/billing` endpoint so we get the failure reason for the nav
   * indicator label). Always `null` for non-admins — they only see the
   * boolean `hasIssue` to drive their read-only badge.
   */
  paymentIssue: PaymentIssueDetail;
};

type Listener = (state: BillingHealth) => void;

let state: BillingHealth = {
  loading: true,
  hasIssue: false,
  isAdmin: false,
  roleResolved: false,
  paymentIssue: null,
};
const listeners = new Set<Listener>();

let initialized = false;
let intervalId: number | null = null;
let visibilityHandler: (() => void) | null = null;
let refreshHandler: (() => void) | null = null;
let eventSource: EventSource | null = null;
let reconnectTimeoutId: number | null = null;
let reconnectDelay = 1_000;
const MAX_RECONNECT_DELAY = 30_000;

// Long fallback poll only — the SSE stream at /api/billing/stream is the
// primary mechanism for keeping this snapshot in sync. Polling is a safety
// net for environments where the stream can't reach this client
// (multi-instance deploys, dropped EventSource that hasn't reconnected
// yet, etc).
const FALLBACK_POLL_MS = 5 * 60_000;

function paymentIssueEqual(a: PaymentIssueDetail, b: PaymentIssueDetail): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.reason === b.reason &&
    a.invoiceId === b.invoiceId &&
    a.message === b.message &&
    a.failedAt === b.failedAt
  );
}

function setState(patch: Partial<BillingHealth>) {
  const next = { ...state, ...patch };
  if (
    next.loading === state.loading &&
    next.hasIssue === state.hasIssue &&
    next.isAdmin === state.isAdmin &&
    next.roleResolved === state.roleResolved &&
    paymentIssueEqual(next.paymentIssue, state.paymentIssue)
  ) {
    return;
  }
  state = next;
  for (const l of listeners) l(state);
}

async function fetchStatus() {
  try {
    const res = await fetch("/api/billing/status", { cache: "no-store" });
    if (!res.ok) {
      // Treat 401/etc. as "no issue we can detect" so we don't accidentally
      // grey out every button on the login redirect.
      setState({ hasIssue: false, loading: false });
      return;
    }
    const data = (await res.json()) as { paymentIssue?: boolean };
    setState({ hasIssue: Boolean(data.paymentIssue), loading: false });
  } catch {
    setState({ loading: false });
  }
}

async function fetchAdminBillingDetails() {
  // Only admins can hit /api/billing (it 403s for everyone else). We use it
  // to get the failure reason needed to label the admin nav indicator.
  if (!state.isAdmin) {
    if (state.paymentIssue !== null) setState({ paymentIssue: null });
    return;
  }
  try {
    const res = await fetch("/api/billing", { cache: "no-store" });
    if (!res.ok) {
      setState({ paymentIssue: null });
      return;
    }
    const data = (await res.json()) as { paymentIssue?: PaymentIssueDetail };
    setState({ paymentIssue: data.paymentIssue ?? null });
  } catch {
    /* keep previous detail; the boolean badge still flips via fetchStatus */
  }
}

function refreshAll() {
  // If the initial /api/auth/user lookup failed transiently we'd be stuck
  // treating an actual admin as a non-admin forever, which would hide the
  // admin nav indicator until a hard refresh. Retry role resolution on
  // every refresh trigger (visibility, SSE 'changed', billing:refresh,
  // fallback poll) so we self-heal automatically.
  if (!state.roleResolved) fetchRole();
  fetchStatus();
  fetchAdminBillingDetails();
}

async function fetchRole() {
  try {
    const res = await fetch("/api/auth/user", { cache: "no-store" });
    if (!res.ok) {
      // Logged-out / 401 — mark as resolved (false) so callers don't wait.
      setState({ isAdmin: false, roleResolved: true });
      return;
    }
    const j = (await res.json()) as { user?: { role?: string } | null };
    const wasAdmin = state.isAdmin;
    const isAdmin = j.user?.role === "Admin";
    setState({ isAdmin, roleResolved: true });
    // Once we know the user is an admin, fetch the detailed billing payload
    // so the indicator label has its `reason`. Non-admins skip this entirely.
    if (isAdmin && !wasAdmin) fetchAdminBillingDetails();
  } catch {
    setState({ roleResolved: true });
  }
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  fetchRole();
  fetchStatus();

  intervalId = window.setInterval(refreshAll, FALLBACK_POLL_MS);

  visibilityHandler = () => {
    if (document.visibilityState === "visible") refreshAll();
  };
  document.addEventListener("visibilitychange", visibilityHandler);

  // Other components (modal error handlers, etc.) dispatch this event when
  // they observe a billing-blocked response — refresh immediately so the
  // gated buttons and nav badges flip without waiting up to 5 minutes.
  refreshHandler = () => refreshAll();
  window.addEventListener(BILLING_REFRESH_EVENT, refreshHandler);

  openEventSource();
}

function openEventSource() {
  try {
    eventSource = new EventSource("/api/billing/stream");
    eventSource.onopen = () => {
      reconnectDelay = 1_000;
    };
    eventSource.onmessage = (evt) => {
      reconnectDelay = 1_000;
      try {
        const payload = JSON.parse(evt.data) as { type?: string };
        if (payload.type === "changed") refreshAll();
      } catch {
        /* ignore malformed frames */
      }
    };
    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      if (reconnectTimeoutId !== null) return;
      reconnectTimeoutId = window.setTimeout(() => {
        reconnectTimeoutId = null;
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        openEventSource();
      }, reconnectDelay);
    };
  } catch {
    /* fallback poll still covers us */
  }
}

function teardown() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  if (visibilityHandler !== null) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (refreshHandler !== null) {
    window.removeEventListener(BILLING_REFRESH_EVENT, refreshHandler);
    refreshHandler = null;
  }
  if (reconnectTimeoutId !== null) {
    window.clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
  if (eventSource !== null) {
    eventSource.close();
    eventSource = null;
  }
  initialized = false;
  reconnectDelay = 1_000;
  state = {
    loading: true,
    hasIssue: false,
    isAdmin: false,
    roleResolved: false,
    paymentIssue: null,
  };
}

/**
 * Subscribe to billing health updates. Returns an unsubscribe fn. Lazily
 * initialises the shared SSE/poll on first call from any consumer.
 */
export function subscribeBillingHealth(listener: Listener): () => void {
  ensureInit();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) teardown();
  };
}

/** Get the current snapshot (without subscribing). */
export function getBillingHealthSnapshot(): BillingHealth {
  return state;
}

export function useBillingHealth(): BillingHealth {
  const [snapshot, setSnapshot] = useState<BillingHealth>(state);

  useEffect(() => {
    const unsubscribe = subscribeBillingHealth(setSnapshot);
    setSnapshot(state);
    return unsubscribe;
  }, []);

  return snapshot;
}

/** Tooltip copy shown on disabled trigger buttons for non-admin teammates. */
export const BILLING_GATE_DISABLED_TOOLTIP =
  "Your admin needs to fix a billing problem before this works.";

/**
 * Tooltip copy shown to admins (they keep the button enabled but get a
 * gentle nudge that there's a billing issue to resolve).
 */
export const BILLING_GATE_ADMIN_TOOLTIP =
  "Heads up: there's a billing problem on your account. Resolve it in Admin → Billing & plan.";

export type BillingGateProps = {
  /** Should the button be visually disabled and click-blocked? */
  disabled: boolean;
  /** `title` to apply (always falsy when there is nothing to say). */
  title: string | undefined;
  /** Inline style additions to merge in (greys out + not-allowed cursor). */
  style: React.CSSProperties | undefined;
  /** True when the underlying billing health is broken (admin or not). */
  blocked: boolean;
};

const DISABLED_STYLE: React.CSSProperties = {
  opacity: 0.55,
  cursor: "not-allowed",
};

/**
 * Convenience wrapper around `useBillingHealth` that returns the props a
 * trigger button should merge in. Non-admins see the button greyed out with
 * a tooltip; admins keep the button enabled (their nav indicator already
 * links to the fix). While the initial status fetch is in flight we leave
 * the button enabled to avoid a disabled→enabled flash on every page load.
 */
export function useBillingGateProps(): BillingGateProps {
  const { hasIssue, isAdmin, loading, roleResolved } = useBillingHealth();
  if (loading || !hasIssue) {
    return { disabled: false, title: undefined, style: undefined, blocked: false };
  }
  // Wait for the role to land before applying the disabled treatment so
  // admins don't briefly flicker as non-admins if `/api/billing/status`
  // wins the race against `/api/auth/user`.
  if (!roleResolved || isAdmin) {
    return {
      disabled: false,
      title: roleResolved ? BILLING_GATE_ADMIN_TOOLTIP : undefined,
      style: undefined,
      blocked: roleResolved,
    };
  }
  return {
    disabled: true,
    title: BILLING_GATE_DISABLED_TOOLTIP,
    style: DISABLED_STYLE,
    blocked: true,
  };
}
