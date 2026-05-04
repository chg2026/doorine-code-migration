import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
//
// We exercise the real `POST /api/stripe/webhook` handler — and keep the real
// `extractInvoiceDeclineReason` so we can assert it actually drives
// `stripe.invoicePayments.list` — but stub out anything that would touch a
// live Stripe account, the database, or environment secrets.
//
// The signature-verification gate is bypassed by mocking `requireStripe` so
// that `stripe.webhooks.constructEvent` simply returns our crafted event.
// ---------------------------------------------------------------------------

const stripeInvoicePaymentsList = vi.fn();
const stripeWebhooksConstructEvent = vi.fn();

const fakeStripeClient = {
  invoicePayments: { list: stripeInvoicePaymentsList },
  webhooks: { constructEvent: stripeWebhooksConstructEvent },
};

const findCompanyByStripeCustomerIdMock = vi.fn();
const activityLogCreateMock = vi.fn();
const subscriptionFindUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLogEntry: {
      create: (...args: unknown[]) => activityLogCreateMock(...args),
    },
    subscription: {
      findUnique: (...args: unknown[]) => subscriptionFindUniqueMock(...args),
    },
  },
}));

vi.mock("@/lib/stripe", async () => {
  // Keep the real `extractInvoiceDeclineReason` so we verify it correctly
  // reads from `stripe.invoicePayments.list` rather than being stubbed out.
  const actual =
    await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return {
    ...actual,
    isStripeConfigured: () => true,
    requireStripe: () => fakeStripeClient,
    findCompanyByStripeCustomerId: (...args: unknown[]) =>
      findCompanyByStripeCustomerIdMock(...args),
  };
});

vi.mock("@/lib/billingEvents", () => ({
  publishBillingChanged: vi.fn(),
}));

vi.mock("@/lib/notifications/billing", () => ({
  isHealthyStatus: () => false,
  isUnhealthyStatus: (s: unknown) => s === "past_due" || s === "unpaid",
  notifyAdminsOfBillingIssue: vi.fn().mockResolvedValue(undefined),
  notifyAdminsOfBillingRecovery: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/stripe/webhook/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body = "{}"): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=1,v1=fake",
    },
    body,
  });
}

function makeInvoicePaymentFailedEvent(
  invoiceId: string,
  customerId: string,
  invoiceNumber: string | null = null
) {
  return {
    id: "evt_test_1",
    type: "invoice.payment_failed",
    data: {
      object: {
        id: invoiceId,
        number: invoiceNumber,
        customer: customerId,
        amount_due: 4900,
        currency: "usd",
        hosted_invoice_url: `https://stripe.example/invoice/${invoiceId}`,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: known company
  findCompanyByStripeCustomerIdMock.mockResolvedValue("company_acme");

  // Default: activityLogEntry.create succeeds
  activityLogCreateMock.mockResolvedValue({ id: "log_1" });

  // Default: subscription is NOT in an unhealthy state (avoids notify branch)
  subscriptionFindUniqueMock.mockResolvedValue({ status: "active" });

  // Default: STRIPE_WEBHOOK_SECRET is set so the route proceeds past that guard
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/stripe/webhook — invoice.payment_failed decline-reason producer", () => {
  it("creates a billing_invoice_payment_failed ActivityLogEntry with declineCode and declineMessage in meta", async () => {
    const event = makeInvoicePaymentFailedEvent(
      "inv_failed_1",
      "cus_acme",
      "INV-001"
    );
    stripeWebhooksConstructEvent.mockReturnValue(event);

    // The real extractInvoiceDeclineReason calls stripe.invoicePayments.list.
    stripeInvoicePaymentsList.mockResolvedValue({
      data: [
        {
          status: "failed",
          created: 1_700_000_500,
          payment: {
            payment_intent: {
              last_payment_error: {
                decline_code: "insufficient_funds",
                message: "Your card has insufficient funds.",
              },
              latest_charge: null,
            },
          },
        },
      ],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // The route must have created an ActivityLogEntry row.
    expect(activityLogCreateMock).toHaveBeenCalledTimes(1);
    expect(activityLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: "company_acme",
          action: "billing_invoice_payment_failed",
          entity: "Invoice",
          entityId: "inv_failed_1",
          meta: expect.objectContaining({
            declineCode: "insufficient_funds",
            declineMessage: "Your card has insufficient funds.",
          }),
        }),
      })
    );

    // The real extractInvoiceDeclineReason must have hit invoicePayments.list.
    expect(stripeInvoicePaymentsList).toHaveBeenCalledTimes(1);
    expect(stripeInvoicePaymentsList).toHaveBeenCalledWith(
      expect.objectContaining({ invoice: "inv_failed_1" })
    );
  });

  it("still writes the ActivityLogEntry when no decline reason is extractable (null meta values)", async () => {
    const event = makeInvoicePaymentFailedEvent("inv_failed_no_reason", "cus_acme");
    stripeWebhooksConstructEvent.mockReturnValue(event);

    // invoicePayments.list returns data but no usable error info.
    stripeInvoicePaymentsList.mockResolvedValue({ data: [] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // The row must exist even with no reason — the cache-hit path on
    // GET /api/billing/invoices relies on the row being present.
    expect(activityLogCreateMock).toHaveBeenCalledTimes(1);
    expect(activityLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "billing_invoice_payment_failed",
          entityId: "inv_failed_no_reason",
          meta: expect.objectContaining({
            declineCode: null,
            declineMessage: null,
          }),
        }),
      })
    );
  });

  it("does not create an ActivityLogEntry for an unknown customer", async () => {
    const event = makeInvoicePaymentFailedEvent("inv_unknown", "cus_unknown");
    stripeWebhooksConstructEvent.mockReturnValue(event);

    // No company maps to this customer.
    findCompanyByStripeCustomerIdMock.mockResolvedValue(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // No log row — nothing to cache for an unknown customer.
    expect(activityLogCreateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the stripe-signature header is missing", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    // No ActivityLogEntry should be written if the signature check is missing.
    expect(activityLogCreateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when constructEvent throws (bad signature)", async () => {
    stripeWebhooksConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(activityLogCreateMock).not.toHaveBeenCalled();
  });
});
