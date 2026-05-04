import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Shared billing health store tests.
 *
 * The store (`lib/useBillingHealth.ts`) keeps module-level singletons —
 * `initialized`, one EventSource, one interval, one set of listeners, etc.
 * Every test that exercises the store must call `vi.resetModules()` first so
 * it gets a completely fresh copy of the module and its singleton state.
 * All imports are done dynamically (after the reset) for the same reason.
 *
 * The component tests use `vi.doMock()` (not `vi.mock()`) so the mocks are
 * NOT hoisted — they only take effect after the explicit `vi.resetModules()`
 * call inside each test, keeping them isolated from the store unit tests.
 */

// next/link is a simple anchor wrapper for all component tests.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) =>
    React.createElement("a", { href, ...rest }, children),
}));

// React must be in scope for the JSX in the mock factory above.
import React from "react";

// ─────────────────────────── helpers ────────────────────────────────────────

class TrackingEventSource {
  static instances: TrackingEventSource[] = [];
  url: string;
  onmessage: ((evt: MessageEvent) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;
  onopen: ((evt: Event) => void) | null = null;
  readyState = 1;
  constructor(url: string) {
    this.url = url;
    TrackingEventSource.instances.push(this);
  }
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
  /** Simulate an incoming SSE message from the server. */
  simulateMessage(data: unknown) {
    this.onmessage?.({
      data: JSON.stringify(data),
    } as MessageEvent);
  }
}

type FetchConfig = {
  paymentIssue: boolean;
  role: "Admin" | "Member";
  adminDetail?: {
    reason: string;
    invoiceId: string | null;
    message: string | null;
    failedAt: string | null;
  } | null;
};

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(cfg: FetchConfig) {
  const counts = { status: 0, role: 0, billing: 0 };
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/billing/status") {
      counts.status += 1;
      return jsonOk({ paymentIssue: cfg.paymentIssue });
    }
    if (url === "/api/auth/user") {
      counts.role += 1;
      return jsonOk({ user: { role: cfg.role } });
    }
    if (url === "/api/billing") {
      counts.billing += 1;
      return jsonOk({ paymentIssue: cfg.adminDetail ?? null });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return { mock, counts };
}

/** Reset modules, stub globals, then dynamically import the fresh store. */
async function freshStore(cfg: FetchConfig) {
  vi.resetModules();
  TrackingEventSource.instances = [];
  vi.stubGlobal("EventSource", TrackingEventSource as unknown as typeof EventSource);
  const { mock, counts } = installFetch(cfg);

  const store = await import("@/lib/useBillingHealth");
  const { BILLING_REFRESH_EVENT } = await import("@/lib/billing-blocked-client");
  return { store, counts, mock, BILLING_REFRESH_EVENT };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  TrackingEventSource.instances = [];
});

// ─────────────────────────── store unit tests ────────────────────────────────

describe("useBillingHealth shared store — single EventSource", () => {
  it("opens exactly one /api/billing/stream EventSource even when multiple subscribers call subscribeBillingHealth", async () => {
    const { store } = await freshStore({ paymentIssue: false, role: "Member" });

    const unsub1 = store.subscribeBillingHealth(() => {});
    const unsub2 = store.subscribeBillingHealth(() => {});
    const unsub3 = store.subscribeBillingHealth(() => {});

    expect(TrackingEventSource.instances).toHaveLength(1);
    expect(TrackingEventSource.instances[0].url).toBe("/api/billing/stream");

    unsub1();
    unsub2();
    unsub3();
  });
});

describe("useBillingHealth shared store — admins vs. non-admins", () => {
  it("fetches /api/billing when the user is an Admin", async () => {
    const { store, counts } = await freshStore({
      paymentIssue: true,
      role: "Admin",
      adminDetail: {
        reason: "past_due",
        invoiceId: "in_1",
        message: null,
        failedAt: null,
      },
    });

    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() => {
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });
    await RTL.waitFor(() => {
      expect(counts.billing).toBeGreaterThanOrEqual(1);
    });

    unsub();
  });

  it("never fetches /api/billing when the user is a non-admin Member", async () => {
    const { store, counts } = await freshStore({
      paymentIssue: true,
      role: "Member",
    });

    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() => {
      expect(counts.role).toBeGreaterThanOrEqual(1);
      expect(counts.status).toBeGreaterThanOrEqual(1);
    });

    // Give time for any accidental /api/billing call to arrive.
    await new Promise((r) => setTimeout(r, 50));
    expect(counts.billing).toBe(0);

    unsub();
  });

  it("populates paymentIssue in the snapshot for admins once /api/billing responds", async () => {
    const detail = {
      reason: "invoice_failed",
      invoiceId: "in_abc",
      message: "Card declined",
      failedAt: "2026-01-01T00:00:00Z",
    };
    const { store, counts } = await freshStore({
      paymentIssue: true,
      role: "Admin",
      adminDetail: detail,
    });

    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() => {
      expect(counts.billing).toBeGreaterThanOrEqual(1);
    });

    const snap = store.getBillingHealthSnapshot();
    expect(snap.isAdmin).toBe(true);
    expect(snap.paymentIssue).toMatchObject(detail);

    unsub();
  });

  it("leaves paymentIssue null in the snapshot for non-admin Members", async () => {
    const { store, counts } = await freshStore({
      paymentIssue: true,
      role: "Member",
    });

    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    await new Promise((r) => setTimeout(r, 50));
    const snap = store.getBillingHealthSnapshot();
    expect(snap.paymentIssue).toBeNull();

    unsub();
  });
});

/** Shared admin config reused by all trigger tests. */
const ADMIN_CFG: FetchConfig = {
  paymentIssue: true,
  role: "Admin",
  adminDetail: { reason: "past_due", invoiceId: "in_1", message: null, failedAt: null },
};

describe("useBillingHealth shared store — refresh triggers", () => {
  it("re-fetches BOTH /api/billing/status and /api/billing when the SSE 'changed' message arrives (admin)", async () => {
    const { store, counts } = await freshStore(ADMIN_CFG);

    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.billing).toBeGreaterThanOrEqual(1);
    });

    const statusBefore = counts.status;
    const billingBefore = counts.billing;
    TrackingEventSource.instances[0].simulateMessage({ type: "changed" });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThan(statusBefore);
      expect(counts.billing).toBeGreaterThan(billingBefore);
    });

    unsub();
  });

  it("re-fetches BOTH endpoints when the billing:refresh window event fires (admin)", async () => {
    const { store, counts, BILLING_REFRESH_EVENT } = await freshStore(ADMIN_CFG);

    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.billing).toBeGreaterThanOrEqual(1);
    });

    const statusBefore = counts.status;
    const billingBefore = counts.billing;
    await RTL.act(async () => {
      window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
    });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThan(statusBefore);
      expect(counts.billing).toBeGreaterThan(billingBefore);
    });

    unsub();
  });

  it("re-fetches BOTH endpoints when the page becomes visible (visibilitychange, admin)", async () => {
    const { store, counts } = await freshStore(ADMIN_CFG);

    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.billing).toBeGreaterThanOrEqual(1);
    });

    const statusBefore = counts.status;
    const billingBefore = counts.billing;

    await RTL.act(async () => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThan(statusBefore);
      expect(counts.billing).toBeGreaterThan(billingBefore);
    });

    unsub();
  });

  it("fires the 5-minute fallback poll and refreshes BOTH endpoints (admin)", async () => {
    // Spy-through: capture the callback but still call the real setInterval
    // so initial fetches and waitFor polling are unaffected. We then call the
    // captured callback directly to simulate a 5-minute tick without needing
    // fake timers (which would break waitFor's internal setTimeout polling).
    const realSetInterval = window.setInterval.bind(window);
    let capturedCallback: (() => void) | null = null;
    const setIntervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementation((callback: TimerHandler, ms?: number) => {
        if (ms === 5 * 60 * 1000) {
          capturedCallback = callback as () => void;
        }
        return realSetInterval(callback as TimerHandler, ms);
      });

    const { store, counts } = await freshStore(ADMIN_CFG);
    const RTL = await import("@testing-library/react");
    const unsub = store.subscribeBillingHealth(() => {});

    // Wait for the initial round of fetches to complete.
    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.billing).toBeGreaterThanOrEqual(1);
    });

    // Confirm the interval was registered at the right cadence.
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
    expect(capturedCallback).not.toBeNull();

    const statusBefore = counts.status;
    const billingBefore = counts.billing;

    // Manually fire one interval tick — equivalent to 5 minutes elapsing.
    await RTL.act(async () => {
      capturedCallback!();
    });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThan(statusBefore);
      expect(counts.billing).toBeGreaterThan(billingBefore);
    });

    setIntervalSpy.mockRestore();
    unsub();
  });
});

describe("useBillingHealth shared store — listeners only fire on state changes", () => {
  it("does NOT invoke listeners when the fetched state is identical to the current snapshot", async () => {
    const { store, counts } = await freshStore({
      paymentIssue: false,
      role: "Member",
    });

    const RTL = await import("@testing-library/react");
    const calls: unknown[] = [];
    const unsub = store.subscribeBillingHealth((s) => calls.push(s));

    // Wait until the initial state has settled (loading → false).
    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });
    const callsAfterInit = calls.length;

    // Trigger a second refresh — the fetch returns the exact same data so
    // the snapshot is unchanged and no listener call should be added.
    const { BILLING_REFRESH_EVENT } = await import("@/lib/billing-blocked-client");
    await RTL.act(async () => {
      window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
    });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThan(1);
    });

    // Allow a tick for any erroneous extra listener calls to propagate.
    await new Promise((r) => setTimeout(r, 30));

    expect(calls.length).toBe(callsAfterInit);
    unsub();
  });

  it("invokes listeners when hasIssue flips from false to true", async () => {
    let reportPaymentIssue = false;
    vi.resetModules();
    TrackingEventSource.instances = [];
    vi.stubGlobal("EventSource", TrackingEventSource as unknown as typeof EventSource);
    const counts = { status: 0, role: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/billing/status") {
          counts.status += 1;
          return jsonOk({ paymentIssue: reportPaymentIssue });
        }
        if (url === "/api/auth/user") {
          counts.role += 1;
          return jsonOk({ user: { role: "Member" } });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const store = await import("@/lib/useBillingHealth");
    const { BILLING_REFRESH_EVENT } = await import("@/lib/billing-blocked-client");
    const RTL = await import("@testing-library/react");

    const snaps: unknown[] = [];
    const unsub = store.subscribeBillingHealth((s) => snaps.push({ ...s }));

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
    });

    const snapsAfterInit = snaps.length;
    expect(store.getBillingHealthSnapshot().hasIssue).toBe(false);

    // Now the backend reports a billing problem.
    reportPaymentIssue = true;
    await RTL.act(async () => {
      window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
    });

    await RTL.waitFor(() => {
      expect(store.getBillingHealthSnapshot().hasIssue).toBe(true);
    });

    // At least one listener call happened after the state change.
    expect(snaps.length).toBeGreaterThan(snapsAfterInit);
    const latestSnap = snaps[snaps.length - 1] as { hasIssue: boolean };
    expect(latestSnap.hasIssue).toBe(true);

    unsub();
  });
});

// ──────────────────── unsubscribe / teardown tests ───────────────────────────

describe("useBillingHealth shared store — unsubscribe teardown", () => {
  it("does NOT call the listener after unsubscribe is invoked", async () => {
    // Use a mutable flag so we can force a genuine state change after unsub.
    let reportIssue = false;
    vi.resetModules();
    TrackingEventSource.instances = [];
    vi.stubGlobal("EventSource", TrackingEventSource as unknown as typeof EventSource);
    const counts = { status: 0, role: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/billing/status") {
          counts.status += 1;
          return jsonOk({ paymentIssue: reportIssue });
        }
        if (url === "/api/auth/user") {
          counts.role += 1;
          return jsonOk({ user: { role: "Member" } });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const store = await import("@/lib/useBillingHealth");
    const { BILLING_REFRESH_EVENT } = await import("@/lib/billing-blocked-client");
    const RTL = await import("@testing-library/react");

    const calls: unknown[] = [];
    const unsub = store.subscribeBillingHealth((s) => calls.push(s));

    // A second keep-alive subscriber so the store is not torn down when we
    // remove the first listener — this lets us verify the first listener
    // is truly silenced while state changes can still propagate.
    const keepAliveUnsub = store.subscribeBillingHealth(() => {});

    // Wait for the initial state to settle (loading → false, hasIssue: false).
    await RTL.waitFor(() => expect(store.getBillingHealthSnapshot().loading).toBe(false));
    const callsBeforeUnsub = calls.length;

    // Remove the first listener from the internal Set (keep-alive still active).
    unsub();

    // Flip the backend flag so the next fetch produces a real state diff
    // (hasIssue false → true). If unsub failed to remove the listener it
    // would be invoked here.
    reportIssue = true;
    await RTL.act(async () => {
      window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
    });

    // Wait until the store snapshot actually reflects the change so we know
    // the state propagation cycle ran (any still-registered listeners would
    // have been called by now).
    await RTL.waitFor(() => {
      expect(store.getBillingHealthSnapshot().hasIssue).toBe(true);
    });

    // The removed listener must not have been called after unsub().
    expect(calls.length).toBe(callsBeforeUnsub);

    keepAliveUnsub();
  });

  it("accepts a new subscriber after a previous one unsubscribes and calls it on state changes", async () => {
    let reportIssue = false;
    vi.resetModules();
    TrackingEventSource.instances = [];
    vi.stubGlobal("EventSource", TrackingEventSource as unknown as typeof EventSource);
    const counts = { status: 0, role: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/billing/status") {
          counts.status += 1;
          return jsonOk({ paymentIssue: reportIssue });
        }
        if (url === "/api/auth/user") {
          counts.role += 1;
          return jsonOk({ user: { role: "Member" } });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const store = await import("@/lib/useBillingHealth");
    const { BILLING_REFRESH_EVENT } = await import("@/lib/billing-blocked-client");
    const RTL = await import("@testing-library/react");

    // First subscriber — subscribe then immediately unsubscribe.
    const firstCalls: unknown[] = [];
    const unsub1 = store.subscribeBillingHealth((s) => firstCalls.push(s));
    await RTL.waitFor(() => expect(store.getBillingHealthSnapshot().loading).toBe(false));
    unsub1();

    // Second subscriber added after the first was removed.
    const secondCalls: unknown[] = [];
    const unsub2 = store.subscribeBillingHealth((s) => secondCalls.push(s));
    const secondCallsAtSubscribe = secondCalls.length;

    // Capture the first listener's call count BEFORE triggering the refresh.
    // This is the reference point used to prove the unsubscribed listener
    // was not called during the subsequent state-change cycle.
    const firstCallsBeforeRefresh = firstCalls.length;

    // Flip the reported state so a real state change propagates to any
    // currently registered listeners.
    reportIssue = true;
    await RTL.act(async () => {
      window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
    });

    // Wait until the store snapshot confirms the state changed — this
    // guarantees the propagation cycle has run.
    await RTL.waitFor(() => {
      expect(store.getBillingHealthSnapshot().hasIssue).toBe(true);
    });

    // The second subscriber must have received the update.
    expect(secondCalls.length).toBeGreaterThan(secondCallsAtSubscribe);
    const latest = secondCalls[secondCalls.length - 1] as { hasIssue: boolean };
    expect(latest.hasIssue).toBe(true);

    // The first (unsubscribed) listener must not have been called at all
    // after the state change — its count must equal the value captured
    // before the refresh was dispatched.
    expect(firstCalls.length).toBe(firstCallsBeforeRefresh);

    unsub2();
  });
});

// ──────────────────── full teardown + re-init tests ──────────────────────────

describe("useBillingHealth shared store — full teardown when last subscriber leaves", () => {
  it("closes the EventSource when the last subscriber unsubscribes", async () => {
    const { store } = await freshStore({ paymentIssue: false, role: "Member" });
    const RTL = await import("@testing-library/react");

    const unsub = store.subscribeBillingHealth(() => {});

    // Confirm the EventSource was opened.
    expect(TrackingEventSource.instances).toHaveLength(1);
    const es = TrackingEventSource.instances[0];
    const closeSpy = vi.spyOn(es, "close");

    await RTL.waitFor(() =>
      expect(store.getBillingHealthSnapshot().loading).toBe(false),
    );

    // Removing the last subscriber must close the EventSource.
    unsub();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("stops the fallback-poll interval when the last subscriber unsubscribes", async () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const { store } = await freshStore({ paymentIssue: false, role: "Member" });
    const RTL = await import("@testing-library/react");

    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() =>
      expect(store.getBillingHealthSnapshot().loading).toBe(false),
    );

    unsub();

    // clearInterval must have been called (at least once for the poll interval).
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it("removes window event listeners when the last subscriber unsubscribes", async () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { store, BILLING_REFRESH_EVENT } = await freshStore({
      paymentIssue: false,
      role: "Member",
    });
    const RTL = await import("@testing-library/react");

    const unsub = store.subscribeBillingHealth(() => {});

    await RTL.waitFor(() =>
      expect(store.getBillingHealthSnapshot().loading).toBe(false),
    );

    unsub();

    // The billing:refresh window listener must have been removed.
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      BILLING_REFRESH_EVENT,
      expect.any(Function),
    );

    removeEventListenerSpy.mockRestore();
  });

  it("re-subscribing after full teardown opens a fresh EventSource and re-fetches", async () => {
    const { store, counts } = await freshStore({ paymentIssue: false, role: "Member" });
    const RTL = await import("@testing-library/react");

    // First subscription lifecycle — subscribe, wait for init, then remove last sub.
    const unsub1 = store.subscribeBillingHealth(() => {});
    await RTL.waitFor(() =>
      expect(store.getBillingHealthSnapshot().loading).toBe(false),
    );
    unsub1(); // triggers full teardown

    // State must be reset to the initial loading shape.
    expect(store.getBillingHealthSnapshot()).toMatchObject({
      loading: true,
      hasIssue: false,
      isAdmin: false,
      roleResolved: false,
      paymentIssue: null,
    });

    const esCountAfterTeardown = TrackingEventSource.instances.length;
    const statusCountAfterTeardown = counts.status;

    // Re-subscribe — must re-initialise the store from scratch.
    const unsub2 = store.subscribeBillingHealth(() => {});

    // A new EventSource must be opened.
    await RTL.waitFor(() =>
      expect(TrackingEventSource.instances.length).toBeGreaterThan(esCountAfterTeardown),
    );

    // Fetches must fire again.
    await RTL.waitFor(() =>
      expect(counts.status).toBeGreaterThan(statusCountAfterTeardown),
    );

    // Store must settle back to a resolved (non-loading) state.
    await RTL.waitFor(() =>
      expect(store.getBillingHealthSnapshot().loading).toBe(false),
    );

    unsub2();
  });
});

// ─────────────────────────── component tests ────────────────────────────────

describe("<BillingNavBadge /> rendering off the shared store", () => {
  it("renders the billing problem badge when hasIssue is true", async () => {
    vi.resetModules();
    vi.doMock("@/lib/useBillingHealth", () => ({
      useBillingHealth: () => ({
        loading: false,
        hasIssue: true,
        isAdmin: false,
        roleResolved: true,
        paymentIssue: null,
      }),
    }));

    const RTL = await import("@testing-library/react");
    const BillingNavBadge = (await import("@/components/BillingNavBadge")).default;

    RTL.render(React.createElement(BillingNavBadge));

    const badge = RTL.screen.getByRole("status");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Account billing problem — contact your admin");
    expect(badge).toHaveTextContent(/billing problem/i);
  });

  it("renders nothing when hasIssue is false", async () => {
    vi.resetModules();
    vi.doMock("@/lib/useBillingHealth", () => ({
      useBillingHealth: () => ({
        loading: false,
        hasIssue: false,
        isAdmin: false,
        roleResolved: true,
        paymentIssue: null,
      }),
    }));

    const RTL = await import("@testing-library/react");
    const BillingNavBadge = (await import("@/components/BillingNavBadge")).default;

    const { container } = RTL.render(React.createElement(BillingNavBadge));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("<BillingNavIndicator /> rendering off the shared store", () => {
  it("renders a link with the correct label when paymentIssue.reason is 'past_due'", async () => {
    vi.resetModules();
    vi.doMock("@/lib/useBillingHealth", () => ({
      useBillingHealth: () => ({
        loading: false,
        hasIssue: true,
        isAdmin: true,
        roleResolved: true,
        paymentIssue: {
          reason: "past_due",
          invoiceId: "in_1",
          message: null,
          failedAt: null,
        },
      }),
    }));

    const RTL = await import("@testing-library/react");
    const BillingNavIndicator = (await import("@/components/BillingNavIndicator")).default;

    RTL.render(React.createElement(BillingNavIndicator));

    const link = RTL.screen.getByRole("link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/admin?panel=billing#billing-payment-issue");
    expect(link).toHaveAttribute("aria-label", "Subscription past due — open Billing & plan");
    expect(link).toHaveTextContent(/billing problem/i);
  });

  it("renders with 'Last invoice payment failed' label for invoice_failed reason", async () => {
    vi.resetModules();
    vi.doMock("@/lib/useBillingHealth", () => ({
      useBillingHealth: () => ({
        loading: false,
        hasIssue: true,
        isAdmin: true,
        roleResolved: true,
        paymentIssue: {
          reason: "invoice_failed",
          invoiceId: "in_2",
          message: "Card declined",
          failedAt: "2026-03-01T00:00:00Z",
        },
      }),
    }));

    const RTL = await import("@testing-library/react");
    const BillingNavIndicator = (await import("@/components/BillingNavIndicator")).default;

    RTL.render(React.createElement(BillingNavIndicator));

    const link = RTL.screen.getByRole("link");
    expect(link).toHaveAttribute(
      "aria-label",
      "Last invoice payment failed — open Billing & plan",
    );
  });

  it("renders nothing when paymentIssue is null", async () => {
    vi.resetModules();
    vi.doMock("@/lib/useBillingHealth", () => ({
      useBillingHealth: () => ({
        loading: false,
        hasIssue: false,
        isAdmin: true,
        roleResolved: true,
        paymentIssue: null,
      }),
    }));

    const RTL = await import("@testing-library/react");
    const BillingNavIndicator = (await import("@/components/BillingNavIndicator")).default;

    const { container } = RTL.render(React.createElement(BillingNavIndicator));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders with 'Subscription unpaid' label for unpaid reason", async () => {
    vi.resetModules();
    vi.doMock("@/lib/useBillingHealth", () => ({
      useBillingHealth: () => ({
        loading: false,
        hasIssue: true,
        isAdmin: true,
        roleResolved: true,
        paymentIssue: {
          reason: "unpaid",
          invoiceId: "in_3",
          message: null,
          failedAt: null,
        },
      }),
    }));

    const RTL = await import("@testing-library/react");
    const BillingNavIndicator = (await import("@/components/BillingNavIndicator")).default;

    RTL.render(React.createElement(BillingNavIndicator));

    const link = RTL.screen.getByRole("link");
    expect(link).toHaveAttribute("aria-label", "Subscription unpaid — open Billing & plan");
  });
});
