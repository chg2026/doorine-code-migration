import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CardElement: () => null,
  useElements: () => null,
  useStripe: () => null,
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(async () => null),
}));

import BillingPanel from "@/app/admin/BillingPanel";

type PaymentIssueReason = "past_due" | "unpaid" | "invoice_failed";

function makeBillingState(
  paymentIssue: {
    reason: PaymentIssueReason;
    invoiceId?: string | null;
    message?: string | null;
    failedAt?: string | null;
    hostedInvoiceUrl?: string | null;
    declineCode?: string | null;
    declineMessage?: string | null;
  },
  subscriptionStatus = "past_due",
) {
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
      status: subscriptionStatus,
      seatLimit: 25,
      seatsInUse: 3,
      currentPeriodEnd: "2030-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      paymentMethod: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 },
      stripeCustomerId: "cus_test_123",
      stripeSubscriptionId: "sub_test_123",
    },
    paymentIssue: {
      invoiceId: paymentIssue.invoiceId ?? "in_test_123",
      message: paymentIssue.message ?? null,
      failedAt: paymentIssue.failedAt ?? null,
      hostedInvoiceUrl: paymentIssue.hostedInvoiceUrl ?? null,
      declineCode: paymentIssue.declineCode ?? null,
      declineMessage: paymentIssue.declineMessage ?? null,
      reason: paymentIssue.reason,
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function stubBillingFetch(state: ReturnType<typeof makeBillingState>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method || "GET").toUpperCase();
    if (url.startsWith("/api/billing/invoices")) return jsonResponse({ invoices: [] });
    if (url === "/api/billing" && method === "GET") return jsonResponse(state);
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("BillingPanel — past-due / unpaid payment-issue banner", () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewSpy = vi.fn();
    // jsdom doesn't implement scrollIntoView; stub it on every Element.
    (Element.prototype as unknown as { scrollIntoView: typeof scrollIntoViewSpy }).scrollIntoView =
      scrollIntoViewSpy;
    // Run rAF callbacks immediately so the scroll happens synchronously.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("renders the red past_due banner with headline, decline reason, and Update card button", async () => {
    stubBillingFetch(
      makeBillingState({
        reason: "past_due",
        declineCode: "card_declined",
        declineMessage: "Your card was declined.",
        message: "Stripe webhook reported invoice.payment_failed",
        failedAt: "2026-04-15T10:00:00.000Z",
      }),
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveAttribute("id", "billing-payment-issue");
    // Visual: red background / border on the banner.
    expect(banner).toHaveStyle({ background: "#fef3f2" });
    expect(banner).toHaveStyle({ border: "1px solid #b42318" });

    expect(within(banner).getByText("Your subscription is past due")).toBeInTheDocument();
    // Decline reason rendered from declineCode + declineMessage.
    expect(within(banner).getByText(/Reason:\s*Your card was declined\./)).toBeInTheDocument();
    expect(
      within(banner).getByRole("button", { name: /update card/i }),
    ).toBeInTheDocument();
  });

  it("renders the unpaid headline when reason is 'unpaid'", async () => {
    stubBillingFetch(makeBillingState({ reason: "unpaid" }, "unpaid"));

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const banner = await screen.findByRole("alert");
    expect(within(banner).getByText("Your subscription is unpaid")).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: /update card/i })).toBeInTheDocument();
  });

  it("renders the invoice_failed headline and humanized decline code when no message provided", async () => {
    stubBillingFetch(
      makeBillingState({
        reason: "invoice_failed",
        declineCode: "insufficient_funds",
      }),
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const banner = await screen.findByRole("alert");
    expect(
      within(banner).getByText("Your last invoice payment failed"),
    ).toBeInTheDocument();
    expect(
      within(banner).getByText(/Reason:\s*Card declined: insufficient funds/),
    ).toBeInTheDocument();
  });

  it("renders the 'View invoice' link with correct href, target, and rel when hostedInvoiceUrl is set", async () => {
    stubBillingFetch(
      makeBillingState({
        reason: "past_due",
        hostedInvoiceUrl: "https://invoice.stripe.com/i/test_123",
      }),
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const banner = await screen.findByRole("alert");
    const link = within(banner).getByRole("link", { name: /view invoice/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://invoice.stripe.com/i/test_123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render the 'View invoice' link when hostedInvoiceUrl is null", async () => {
    stubBillingFetch(
      makeBillingState({
        reason: "past_due",
        hostedInvoiceUrl: null,
      }),
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const banner = await screen.findByRole("alert");
    expect(within(banner).queryByRole("link", { name: /view invoice/i })).not.toBeInTheDocument();
  });

  it("clicking 'Update card' opens the payment-method editor and scrolls #billing-payment-method into view", async () => {
    stubBillingFetch(
      makeBillingState({
        reason: "past_due",
        declineCode: "card_declined",
        declineMessage: "Your card was declined.",
      }),
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const banner = await screen.findByRole("alert");
    const updateCardButton = within(banner).getByRole("button", { name: /update card/i });

    // Before click: payment-method group is in the DOM but the editor (Save
    // card button) is not — only the read-only "Update" / "Remove" buttons.
    const paymentMethodGroup = document.getElementById("billing-payment-method");
    expect(paymentMethodGroup).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /save card/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      await userEvent.click(updateCardButton);
    });

    // The editor opened (CardEditor renders a "Save card" button).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save card/i })).toBeInTheDocument();
    });

    // And the panel scrolled #billing-payment-method into view.
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    // The element scrollIntoView was invoked on must be the
    // #billing-payment-method group.
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(paymentMethodGroup);
  });
});

describe("BillingPanel — payment-issue banner is absent when paymentIssue is null", () => {
  beforeEach(() => {
    stubBillingFetch({
      ...makeBillingState({ reason: "past_due" }),
      paymentIssue: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not render the red banner when paymentIssue is null", async () => {
    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading…/)).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.getElementById("billing-payment-issue")).toBeNull();
  });
});
