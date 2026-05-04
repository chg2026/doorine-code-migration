import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The BillingPanel imports @stripe/react-stripe-js (Elements, CardElement,
// useElements, useStripe) at module load. We don't render any Elements tree
// in this test (we only exercise the recovery banner, which lives outside
// <Elements>), so a thin module mock keeps jsdom happy without booting
// Stripe.js for real.
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CardElement: () => null,
  useElements: () => null,
  useStripe: () => null,
}));

const confirmCardPayment = vi.fn(async () => ({ paymentIntent: { status: "succeeded" } }));
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(async () => ({ confirmCardPayment })),
}));

import BillingPanel from "@/app/admin/BillingPanel";

type SubStatus = "incomplete" | "incomplete_expired" | "active";

function makeBillingState(status: SubStatus) {
  return {
    config: {
      configured: true,
      publishableKey: "pk_test_dummy",
      pricesConfigured: { Starter: true, Operator: true, Enterprise: true },
    },
    plans: {
      Starter: { seatLimit: 5, pricePerSeatCents: 1000, description: "Starter plan" },
      Operator: { seatLimit: 25, pricePerSeatCents: 2000, description: "Operator plan" },
      Enterprise: { seatLimit: 100, pricePerSeatCents: 4000, description: "Enterprise plan" },
    },
    subscription: {
      plan: "Operator",
      status,
      seatLimit: 25,
      seatsInUse: 3,
      currentPeriodEnd: status === "active" ? "2030-01-01T00:00:00.000Z" : null,
      cancelAtPeriodEnd: false,
      paymentMethod: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 },
      stripeCustomerId: "cus_test_123",
      stripeSubscriptionId: "sub_test_123",
    },
    paymentIssue: null,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe.each<{ initial: SubStatus }>([
  { initial: "incomplete" },
  { initial: "incomplete_expired" },
])("BillingPanel — stuck-payment recovery banner ($initial)", ({ initial }) => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let billingStatus: SubStatus;
  let confirmCalls: number;
  let syncCalls: number;
  let recordedOrder: string[];

  beforeEach(() => {
    confirmCardPayment.mockClear();
    billingStatus = initial;
    confirmCalls = 0;
    syncCalls = 0;
    recordedOrder = [];

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method || "GET").toUpperCase();
      const key = `${method} ${url}`;

      if (url.startsWith("/api/billing/invoices")) {
        return jsonResponse({ invoices: [] });
      }
      if (url === "/api/billing" && method === "GET") {
        return jsonResponse(makeBillingState(billingStatus));
      }
      if (url === "/api/billing/subscription/confirm" && method === "POST") {
        confirmCalls += 1;
        recordedOrder.push("confirm");
        return jsonResponse({ clientSecret: "pi_test_recovery_secret_abc" });
      }
      if (url === "/api/billing/subscription/sync" && method === "POST") {
        syncCalls += 1;
        recordedOrder.push("sync");
        // Once the sync runs, the subscription has flipped to active in the DB,
        // so subsequent /api/billing polls reflect that.
        billingStatus = "active";
        return jsonResponse({ ok: true, status: "active" });
      }
      throw new Error(`Unexpected fetch: ${key}`);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it(`renders the recovery banner for ${initial} subs, runs /confirm then /sync on click, and hides the banner once active`, async () => {
    const onToast = vi.fn();
    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={onToast} />);

    // Banner is keyed off subscription.status === "incomplete" + a
    // stripeSubscriptionId, both of which are present in our seed state.
    const bannerHeading = await screen.findByText("Finish setting up your subscription");
    expect(bannerHeading).toBeInTheDocument();

    const confirmButton = await screen.findByRole("button", { name: /confirm payment/i });
    expect(confirmButton).toBeEnabled();

    await act(async () => {
      await userEvent.click(confirmButton);
    });

    // The button should hit POST /confirm, then Stripe.js confirmCardPayment,
    // then POST /sync — in that exact order. Mirrors smoke-stripe.ts step 6b.
    await waitFor(() => {
      expect(confirmCalls).toBe(1);
      expect(syncCalls).toBe(1);
    });
    expect(confirmCardPayment).toHaveBeenCalledWith("pi_test_recovery_secret_abc");
    expect(recordedOrder).toEqual(["confirm", "sync"]);

    // After /sync flips the DB, the panel re-fetches /api/billing and re-
    // renders without the banner.
    await waitFor(() => {
      expect(
        screen.queryByText("Finish setting up your subscription"),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /confirm payment/i })).not.toBeInTheDocument();
    });

    expect(onToast).toHaveBeenCalledWith("Payment confirmed");
  });
});

describe("BillingPanel — recovery banner is absent for healthy subs", () => {
  beforeEach(() => {
    confirmCardPayment.mockClear();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method || "GET").toUpperCase();
      if (url.startsWith("/api/billing/invoices")) return jsonResponse({ invoices: [] });
      if (url === "/api/billing" && method === "GET") {
        return jsonResponse(makeBillingState("active"));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not render the recovery banner when the subscription is already active", async () => {
    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    // Wait for initial /api/billing fetch to settle.
    await waitFor(() => {
      expect(screen.queryByText(/Loading…/)).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Finish setting up your subscription")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm payment/i })).not.toBeInTheDocument();
  });
});
