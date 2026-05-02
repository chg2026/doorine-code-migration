import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({ get: (_k: string) => null, toString: () => "" }),
  usePathname: () => "/pipeline",
}));

class MockEventSource {
  url: string;
  onmessage: ((evt: MessageEvent) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;
  onopen: ((evt: Event) => void) | null = null;
  readyState = 1;
  constructor(url: string) {
    this.url = url;
  }
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}

type Role = "Admin" | "Member";
type FetchState = { paymentIssue: boolean; role: Role };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function installFetchMock(state: FetchState) {
  const counts = { status: 0, role: 0 };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/billing/status") {
      counts.status += 1;
      return jsonResponse({ paymentIssue: state.paymentIssue });
    }
    if (url === "/api/auth/user") {
      counts.role += 1;
      return jsonResponse({ user: { role: state.role } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, counts };
}

/**
 * `useBillingHealth` keeps a module-level singleton (an `initialized` flag,
 * one shared store, one EventSource subscription, etc.) so that every gated
 * button on the page shares one billing snapshot. To get clean isolation
 * between cases we reset the module registry and re-import the component
 * (and React/RTL alongside it) so each test gets a fresh store and a fresh
 * React instance that all reference each other correctly.
 */
async function freshRender(state: FetchState) {
  vi.resetModules();
  vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
  const fetchHelpers = installFetchMock(state);

  const React = (await import("react")).default;
  const RTL = await import("@testing-library/react");
  const AddDealButton = (await import("@/app/pipeline/AddDealButton")).default;
  const { BILLING_REFRESH_EVENT } = await import("@/lib/billing-blocked-client");
  const billingHealth = await import("@/lib/useBillingHealth");

  const utils = RTL.render(React.createElement(AddDealButton));
  return {
    ...fetchHelpers,
    React,
    RTL,
    utils,
    BILLING_REFRESH_EVENT,
    BILLING_GATE_DISABLED_TOOLTIP: billingHealth.BILLING_GATE_DISABLED_TOOLTIP,
    BILLING_GATE_ADMIN_TOOLTIP: billingHealth.BILLING_GATE_ADMIN_TOOLTIP,
  };
}

describe("billing-gated trigger buttons (AddDealButton)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays enabled when /api/billing/status reports no billing issue", async () => {
    const { utils, RTL, counts } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    // Wait for both initial fetches (status + role) to land.
    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    const button = utils.getByRole("button", { name: /\+ add deal/i });
    // Healthy billing → no gating, no tooltip, no aria-disabled.
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("title");
  });

  it("renders disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { utils, RTL, counts, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    const button = utils.getByRole("button", { name: /\+ add deal/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    // The disabled style should also be merged in (greys the button out).
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("stays enabled for Admin users even when paymentIssue=true (admins keep access to fix it)", async () => {
    const { utils, RTL, counts, BILLING_GATE_ADMIN_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Admin",
    });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    const button = utils.getByRole("button", { name: /\+ add deal/i });
    // Admins are nudged with an admin-specific tooltip but the button stays
    // clickable so they can navigate to Admin → Billing & plan.
    await RTL.waitFor(() => {
      expect(button).toHaveAttribute("title", BILLING_GATE_ADMIN_TOOLTIP);
    });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });

  it("flips disabled state after a billing:refresh event fires (no full page reload)", async () => {
    // Start healthy so the button is enabled, then mutate the status that
    // the fetch mock returns and dispatch the shared billing:refresh event
    // — exactly what `notifyBillingBlocked()` does when another part of the
    // app sees a 402 — and assert the gate flips without re-rendering the
    // page.
    const state: FetchState = { paymentIssue: false, role: "Member" };

    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const counts = { status: 0, role: 0 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/billing/status") {
        counts.status += 1;
        return jsonResponse({ paymentIssue: state.paymentIssue });
      }
      if (url === "/api/auth/user") {
        counts.role += 1;
        return jsonResponse({ user: { role: state.role } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const AddDealButton = (await import("@/app/pipeline/AddDealButton")).default;
    const { BILLING_REFRESH_EVENT } = await import("@/lib/billing-blocked-client");
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");

    const utils = RTL.render(React.createElement(AddDealButton));

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    const button = utils.getByRole("button", { name: /\+ add deal/i });
    expect(button).toBeEnabled();

    // Backend now reports a billing problem. Dispatch the same event
    // `notifyBillingBlocked()` fires from billing-blocked-client.
    state.paymentIssue = true;
    const statusCallsBefore = counts.status;
    await RTL.act(async () => {
      window.dispatchEvent(new Event(BILLING_REFRESH_EVENT));
    });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThan(statusCallsBefore);
    });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
  });
});
