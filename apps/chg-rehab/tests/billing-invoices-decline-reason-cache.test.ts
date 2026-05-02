import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
//
// We exercise the real `GET /api/billing/invoices` handler — including the
// real `extractInvoiceDeclineReason` slow path — but stub out anything that
// would touch a live Stripe account, the database, or the auth cookie.
//
// `requireStripe()` returns a hand-rolled fake whose `invoices.list` and
// `invoicePayments.list` are vitest mocks. This lets us assert exactly when
// (and how often) the route round-trips to Stripe vs. reading from the
// ActivityLogEntry cache the webhook writes.
// ---------------------------------------------------------------------------

const stripeInvoicesList = vi.fn();
const stripeInvoicePaymentsList = vi.fn();
const fakeStripeClient = {
  invoices: { list: stripeInvoicesList },
  invoicePayments: { list: stripeInvoicePaymentsList },
};

const getCurrentUserMock = vi.fn();
const loadOrCreateSubscriptionMock = vi.fn();
const findManyMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLogEntry: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

vi.mock("@/lib/stripe", async () => {
  // Keep the real `extractInvoiceDeclineReason` so we can verify the
  // fall-through path actually drives `stripe.invoicePayments.list`.
  const actual =
    await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    isStripeConfigured: () => true,
    requireStripe: () => fakeStripeClient,
    loadOrCreateSubscription: (...args: unknown[]) =>
      loadOrCreateSubscriptionMock(...args),
  };
});

import { GET } from "@/app/api/billing/invoices/route";

type FakeInvoice = {
  id: string;
  number?: string | null;
  status: "open" | "paid" | "void";
  created?: number;
  amount_due?: number;
  amount_paid?: number;
  total?: number;
  currency?: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  last_finalization_error?: { code?: string; message?: string } | null;
};

function makeOpenInvoice(id: string, overrides: Partial<FakeInvoice> = {}): FakeInvoice {
  return {
    id,
    number: id.toUpperCase(),
    status: "open",
    created: 1_700_000_000,
    amount_due: 4900,
    currency: "usd",
    hosted_invoice_url: `https://stripe.example/invoice/${id}`,
    invoice_pdf: `https://stripe.example/invoice/${id}.pdf`,
    last_finalization_error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  getCurrentUserMock.mockResolvedValue({
    id: "user_admin_1",
    companyId: "company_acme",
    role: "Admin",
  });

  loadOrCreateSubscriptionMock.mockResolvedValue({
    companyId: "company_acme",
    stripeCustomerId: "cus_test_acme",
    stripeSubscriptionId: "sub_test_acme",
    plan: "Operator",
    seatLimit: 25,
    status: "active",
  });
});

describe("GET /api/billing/invoices — decline-reason cache", () => {
  it("uses the cached ActivityLogEntry decline reason without calling stripe.invoicePayments.list", async () => {
    const open = makeOpenInvoice("inv_open_1");
    stripeInvoicesList.mockResolvedValue({ data: [open] });

    findManyMock.mockResolvedValue([
      {
        entityId: "inv_open_1",
        meta: {
          declineCode: "insufficient_funds",
          declineMessage: "Your card has insufficient funds.",
        },
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]).toMatchObject({
      stripeInvoiceId: "inv_open_1",
      status: "Open",
      declineCode: "insufficient_funds",
      declineMessage: "Your card has insufficient funds.",
    });

    // The whole point of this caching path: the per-invoice Stripe
    // round-trip must not run when we already have a cached reason.
    expect(stripeInvoicePaymentsList).not.toHaveBeenCalled();

    // And the batched DB lookup happened with the right scoping — newest
    // first, scoped to this company + the open invoice ids only.
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company_acme",
          action: "billing_invoice_payment_failed",
          entity: "Invoice",
          entityId: { in: ["inv_open_1"] },
        }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("falls through to extractInvoiceDeclineReason (stripe.invoicePayments.list) when no cached entry exists", async () => {
    const open = makeOpenInvoice("inv_open_uncached");
    stripeInvoicesList.mockResolvedValue({ data: [open] });

    // No cached rows at all — this is the cold-cache state for a freshly
    // failed invoice the webhook hasn't logged yet.
    findManyMock.mockResolvedValue([]);

    // Real `extractInvoiceDeclineReason` will call this and read decline
    // info off the failed PaymentIntent's `last_payment_error`.
    stripeInvoicePaymentsList.mockResolvedValue({
      data: [
        {
          status: "failed",
          created: 1_700_000_500,
          payment: {
            payment_intent: {
              last_payment_error: {
                decline_code: "card_declined",
                message: "Your card was declined.",
              },
              latest_charge: null,
            },
          },
        },
      ],
    });

    const res = await GET();
    const body = await res.json();

    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]).toMatchObject({
      stripeInvoiceId: "inv_open_uncached",
      status: "Open",
      declineCode: "card_declined",
      declineMessage: "Your card was declined.",
    });

    // We DID round-trip to Stripe for this invoice because the cache miss
    // forced the slow path.
    expect(stripeInvoicePaymentsList).toHaveBeenCalledTimes(1);
    expect(stripeInvoicePaymentsList).toHaveBeenCalledWith(
      expect.objectContaining({ invoice: "inv_open_uncached" }),
    );
  });

  it("uses the most recent ActivityLogEntry when an invoice has multiple billing_invoice_payment_failed entries", async () => {
    const open = makeOpenInvoice("inv_open_retried");
    stripeInvoicesList.mockResolvedValue({ data: [open] });

    // The route asks the DB for `orderBy: { createdAt: "desc" }`, so the
    // newest entry arrives first. The handler must keep that one and
    // discard the older retries — the user should see the *current*
    // reason, not last week's.
    findManyMock.mockResolvedValue([
      {
        entityId: "inv_open_retried",
        meta: {
          declineCode: "expired_card",
          declineMessage: "Your card has expired.",
        },
      },
      {
        entityId: "inv_open_retried",
        meta: {
          declineCode: "insufficient_funds",
          declineMessage: "Your card has insufficient funds.",
        },
      },
      {
        entityId: "inv_open_retried",
        meta: {
          declineCode: "generic_decline",
          declineMessage: "Your card was declined.",
        },
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]).toMatchObject({
      stripeInvoiceId: "inv_open_retried",
      declineCode: "expired_card",
      declineMessage: "Your card has expired.",
    });

    // Newest-wins is meaningless if we secretly fell through to Stripe.
    expect(stripeInvoicePaymentsList).not.toHaveBeenCalled();

    // Sanity: still one DB query for the batched lookup, and it's still
    // sorted newest-first so "first-seen wins" inside the route lines up
    // with "newest wins" semantically.
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });
});
