import { describe, it, expect, vi, afterEach } from "vitest";

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

/**
 * A controllable EventSource mock. Each `new MockEventSource(url)` registers
 * itself as the `lastInstance` so tests can fire synthetic SSE messages by
 * calling `lastInstance.onmessage({ data: "..." })`.
 */
let lastEventSourceInstance: MockEventSource | null = null;
let eventSourceConstructCount = 0;

class MockEventSource {
  url: string;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;
  onopen: ((evt: Event) => void) | null = null;
  readyState = 1;

  constructor(url: string) {
    this.url = url;
    lastEventSourceInstance = this;
    eventSourceConstructCount += 1;
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

/**
 * Fresh-module-import pattern from billing-gated-trigger-buttons.test.tsx:
 * reset the module registry so each test gets a clean singleton store, a
 * fresh EventSource subscription, and a fresh React + RTL instance that all
 * reference the same module graph.
 */
async function freshRender(state: FetchState) {
  lastEventSourceInstance = null;
  eventSourceConstructCount = 0;
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
  const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");

  const utils = RTL.render(React.createElement(AddDealButton));
  return { counts, React, RTL, utils, fetchMock, BILLING_GATE_DISABLED_TOOLTIP };
}

describe("useBillingHealth – SSE stream (EventSource) wiring", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    lastEventSourceInstance = null;
  });

  it("opens an EventSource to /api/billing/stream on init", async () => {
    const { RTL, counts } = await freshRender({ paymentIssue: false, role: "Member" });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
    });

    expect(lastEventSourceInstance).not.toBeNull();
    expect(lastEventSourceInstance!.url).toBe("/api/billing/stream");
  });

  it("re-fetches /api/billing/status when the stream pushes { type: 'changed' }", async () => {
    // Start healthy (paymentIssue: false) so the button is enabled.
    const state: FetchState = { paymentIssue: false, role: "Member" };
    const { RTL, counts, utils } = await freshRender(state);

    // Wait for the initial fetches to settle.
    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    const button = utils.getByRole("button", { name: /\+ add deal/i });
    expect(button).toBeEnabled();

    // Now the backend flips to a billing problem. Simulate the SSE push.
    state.paymentIssue = true;
    const statusCallsBefore = counts.status;

    await RTL.act(async () => {
      lastEventSourceInstance!.onmessage!({ data: JSON.stringify({ type: "changed" }) });
    });

    // The SSE handler must trigger a re-fetch of /api/billing/status.
    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThan(statusCallsBefore);
    });

    // And the gated button must flip to disabled for the non-admin member.
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it("ignores SSE frames where type is not 'changed' (no extra status fetch)", async () => {
    const { RTL, counts } = await freshRender({ paymentIssue: false, role: "Member" });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    const statusCallsBefore = counts.status;

    await RTL.act(async () => {
      // Frame with an unrecognised type — must be ignored.
      lastEventSourceInstance!.onmessage!({ data: JSON.stringify({ type: "ping" }) });
      // Frame with no type field — must also be ignored.
      lastEventSourceInstance!.onmessage!({ data: JSON.stringify({ foo: "bar" }) });
    });

    // Give any potential async side-effects a chance to settle.
    await new Promise((r) => setTimeout(r, 50));

    expect(counts.status).toBe(statusCallsBefore);
  });

  it("opens a new EventSource after onerror fires (exponential back-off reconnect)", async () => {
    const { RTL, counts } = await freshRender({ paymentIssue: false, role: "Member" });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
    });

    expect(lastEventSourceInstance).not.toBeNull();
    const firstInstance = lastEventSourceInstance;

    vi.useFakeTimers();
    try {
      await RTL.act(async () => {
        firstInstance!.onerror!(new Event("error"));
      });

      await RTL.act(async () => {
        vi.runAllTimers();
      });

      expect(lastEventSourceInstance).not.toBeNull();
      expect(lastEventSourceInstance).not.toBe(firstInstance);
      expect(lastEventSourceInstance!.url).toBe("/api/billing/stream");
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets reconnect delay to 1 s via onopen so a second error schedules at the base delay", async () => {
    const { RTL, counts } = await freshRender({ paymentIssue: false, role: "Member" });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
    });

    const firstInstance = lastEventSourceInstance!;

    vi.useFakeTimers();
    try {
      // First error — triggers a reconnect timeout at the base delay (1 s).
      await RTL.act(async () => {
        firstInstance.onerror!(new Event("error"));
      });

      // Advance time enough to let the reconnect fire and open a new EventSource.
      await RTL.act(async () => {
        vi.advanceTimersByTime(1_100);
      });

      const secondInstance = lastEventSourceInstance!;
      expect(secondInstance).not.toBe(firstInstance);

      // Simulate the new connection becoming open — this should reset the delay.
      await RTL.act(async () => {
        secondInstance.onopen!(new Event("open"));
      });

      // Second error on the reconnected EventSource.
      await RTL.act(async () => {
        secondInstance.onerror!(new Event("error"));
      });

      // If the delay was properly reset to 1 s, advancing by 1.1 s should be
      // enough to trigger another reconnect (a third EventSource).
      await RTL.act(async () => {
        vi.advanceTimersByTime(1_100);
      });

      expect(lastEventSourceInstance).not.toBe(secondInstance);
      expect(lastEventSourceInstance!.url).toBe("/api/billing/stream");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires onerror twice before back-off timer fires but only opens one new EventSource", async () => {
    const { RTL, counts } = await freshRender({ paymentIssue: false, role: "Member" });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
    });

    expect(lastEventSourceInstance).not.toBeNull();
    const firstInstance = lastEventSourceInstance;

    vi.useFakeTimers();
    try {
      const constructCountAfterInit = eventSourceConstructCount;

      await RTL.act(async () => {
        firstInstance!.onerror!(new Event("error"));
        firstInstance!.onerror!(new Event("error"));
      });

      await RTL.act(async () => {
        vi.runAllTimers();
      });

      expect(lastEventSourceInstance).not.toBe(firstInstance);
      expect(lastEventSourceInstance!.url).toBe("/api/billing/stream");
      expect(eventSourceConstructCount).toBe(constructCountAfterInit + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores malformed (non-JSON) SSE frames without throwing (no extra status fetch)", async () => {
    const { RTL, counts } = await freshRender({ paymentIssue: false, role: "Member" });

    await RTL.waitFor(() => {
      expect(counts.status).toBeGreaterThanOrEqual(1);
      expect(counts.role).toBeGreaterThanOrEqual(1);
    });

    const statusCallsBefore = counts.status;

    await RTL.act(async () => {
      expect(() => {
        lastEventSourceInstance!.onmessage!({ data: "not valid json {{{{" });
      }).not.toThrow();
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(counts.status).toBe(statusCallsBefore);
  });
});
