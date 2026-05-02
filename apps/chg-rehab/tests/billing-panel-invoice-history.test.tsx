import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

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

function makeBillingState() {
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
      status: "active",
      seatLimit: 25,
      seatsInUse: 3,
      currentPeriodEnd: "2030-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      paymentMethod: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 },
      stripeCustomerId: "cus_test_123",
      stripeSubscriptionId: "sub_test_123",
    },
    paymentIssue: null,
  };
}

function makeInvoice(overrides: Partial<{
  id: string;
  date: string | null;
  amountCents: number;
  currency: string;
  status: "Paid" | "Open" | "Void";
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  declineCode: string | null;
  declineMessage: string | null;
}> = {}) {
  return {
    id: "in_test_001",
    date: "2026-04-01",
    amountCents: 2000,
    currency: "usd",
    status: "Paid" as const,
    hostedInvoiceUrl: null,
    invoicePdf: null,
    declineCode: null,
    declineMessage: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function stubBillingFetch(
  billingState: ReturnType<typeof makeBillingState>,
  invoices: ReturnType<typeof makeInvoice>[],
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method || "GET").toUpperCase();
    if (url.startsWith("/api/billing/invoices")) return jsonResponse({ invoices });
    if (url === "/api/billing" && method === "GET") return jsonResponse(billingState);
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("BillingPanel — invoice history empty state", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the empty-state message and no table when invoices is an empty array", async () => {
    stubBillingFetch(makeBillingState(), []);

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    await screen.findByText(/No invoices yet\./i);

    expect(
      screen.getByText(/Once your first billing cycle closes, invoices will appear here\./i),
    ).toBeInTheDocument();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("BillingPanel — invoice history 'View' links", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the 'View' link with correct href, target='_blank', and rel='noopener noreferrer' when hostedInvoiceUrl is set", async () => {
    const invoiceUrl = "https://invoice.stripe.com/i/acct_test/test_invoice_001";
    stubBillingFetch(
      makeBillingState(),
      [makeInvoice({ hostedInvoiceUrl: invoiceUrl })],
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const link = await screen.findByRole("link", { name: /^view$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", invoiceUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render a 'View' link when hostedInvoiceUrl is null", async () => {
    stubBillingFetch(
      makeBillingState(),
      [makeInvoice({ hostedInvoiceUrl: null })],
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading…/)).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: /^view$/i })).not.toBeInTheDocument();
  });

  it("renders one 'View' link per invoice that has a hostedInvoiceUrl", async () => {
    const urlA = "https://invoice.stripe.com/i/acct_test/inv_aaa";
    const urlB = "https://invoice.stripe.com/i/acct_test/inv_bbb";
    stubBillingFetch(makeBillingState(), [
      makeInvoice({ id: "in_aaa", hostedInvoiceUrl: urlA }),
      makeInvoice({ id: "in_bbb", hostedInvoiceUrl: null }),
      makeInvoice({ id: "in_ccc", hostedInvoiceUrl: urlB }),
    ]);

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const links = await screen.findAllByRole("link", { name: /^view$/i });
    expect(links).toHaveLength(2);

    const rows = links.map((l) => l.closest("tr"));
    expect(rows[0]).not.toBe(rows[1]);

    expect(links[0]).toHaveAttribute("href", urlA);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");

    expect(links[1]).toHaveAttribute("href", urlB);
    expect(links[1]).toHaveAttribute("target", "_blank");
    expect(links[1]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no 'View' links at all when every invoice has hostedInvoiceUrl null", async () => {
    stubBillingFetch(makeBillingState(), [
      makeInvoice({ id: "in_x", hostedInvoiceUrl: null }),
      makeInvoice({ id: "in_y", hostedInvoiceUrl: null }),
    ]);

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading…/)).not.toBeInTheDocument();
    });

    expect(screen.queryAllByRole("link", { name: /^view$/i })).toHaveLength(0);
  });
});

describe("BillingPanel — invoice history decline reason", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the humanized decline reason for an Open invoice with declineCode and declineMessage", async () => {
    stubBillingFetch(
      makeBillingState(),
      [
        makeInvoice({
          id: "in_open_001",
          status: "Open",
          declineCode: "insufficient_funds",
          declineMessage: "Your card has insufficient funds.",
        }),
      ],
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    const reasonText = await screen.findByText(/Reason:\s*Card declined: insufficient funds/i);
    expect(reasonText).toBeInTheDocument();
  });

  it("does not show a decline reason line for a Paid invoice with no decline info", async () => {
    stubBillingFetch(
      makeBillingState(),
      [
        makeInvoice({
          id: "in_paid_001",
          status: "Paid",
          declineCode: null,
          declineMessage: null,
        }),
      ],
    );

    render(<BillingPanel isAdmin={true} companyName="Acme Co" onToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading…/)).not.toBeInTheDocument();
    });

    expect(screen.queryByText(/Reason:/i)).not.toBeInTheDocument();
  });
});
