import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractInvoiceDeclineReason } from "@/lib/stripe";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeStripe(
  listImpl: () => Promise<{ data: unknown[] }>
): Pick<Stripe, "invoicePayments"> {
  return {
    invoicePayments: {
      list: vi.fn().mockImplementation(listImpl),
    } as unknown as Stripe["invoicePayments"],
  } as unknown as Pick<Stripe, "invoicePayments">;
}

function makeInvoice(
  overrides: Partial<Stripe.Invoice> = {}
): Stripe.Invoice {
  return {
    id: "inv_test",
    last_finalization_error: null,
    ...overrides,
  } as unknown as Stripe.Invoice;
}

function makePaymentEntry(overrides: {
  status?: string;
  created?: number;
  pi?: {
    last_payment_error?: { decline_code?: string; code?: string; message?: string } | null;
    latest_charge?: {
      outcome?: { seller_message?: string } | null;
      failure_code?: string | null;
      failure_message?: string | null;
    } | null;
  } | null;
}) {
  return {
    status: overrides.status ?? "failed",
    created: overrides.created ?? 1_700_000_000,
    payment: {
      payment_intent: overrides.pi ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractInvoiceDeclineReason – fallback chain", () => {
  it("returns code and message from PaymentIntent last_payment_error (happy path)", async () => {
    const stripe = makeFakeStripe(async () => ({
      data: [
        makePaymentEntry({
          status: "failed",
          pi: {
            last_payment_error: {
              decline_code: "insufficient_funds",
              message: "Your card has insufficient funds.",
            },
            latest_charge: null,
          },
        }),
      ],
    }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice()
    );

    expect(result).toEqual({
      code: "insufficient_funds",
      message: "Your card has insufficient funds.",
    });
  });

  it("prefers decline_code over code within last_payment_error", async () => {
    const stripe = makeFakeStripe(async () => ({
      data: [
        makePaymentEntry({
          status: "failed",
          pi: {
            last_payment_error: {
              decline_code: "card_velocity_exceeded",
              code: "generic_decline",
              message: "Velocity exceeded.",
            },
            latest_charge: null,
          },
        }),
      ],
    }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice()
    );

    expect(result.code).toBe("card_velocity_exceeded");
  });

  it("falls back to charge outcome.seller_message when PI has no last_payment_error", async () => {
    const stripe = makeFakeStripe(async () => ({
      data: [
        makePaymentEntry({
          status: "failed",
          pi: {
            last_payment_error: null,
            latest_charge: {
              outcome: { seller_message: "Do not honour." },
              failure_code: null,
              failure_message: null,
            },
          },
        }),
      ],
    }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice()
    );

    expect(result).toEqual({ code: null, message: "Do not honour." });
  });

  it("falls back to charge failure_code / failure_message when outcome is absent", async () => {
    const stripe = makeFakeStripe(async () => ({
      data: [
        makePaymentEntry({
          status: "failed",
          pi: {
            last_payment_error: null,
            latest_charge: {
              outcome: null,
              failure_code: "expired_card",
              failure_message: "The card has expired.",
            },
          },
        }),
      ],
    }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice()
    );

    expect(result).toEqual({
      code: "expired_card",
      message: "The card has expired.",
    });
  });

  it("outcome.seller_message does not overwrite a message already set by last_payment_error", async () => {
    const stripe = makeFakeStripe(async () => ({
      data: [
        makePaymentEntry({
          status: "failed",
          pi: {
            last_payment_error: {
              decline_code: "do_not_honor",
              message: "PI level message.",
            },
            latest_charge: {
              outcome: { seller_message: "Charge level message." },
              failure_code: null,
              failure_message: null,
            },
          },
        }),
      ],
    }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice()
    );

    expect(result.message).toBe("PI level message.");
    expect(result.code).toBe("do_not_honor");
  });

  it("uses last_finalization_error as final fallback when invoicePayments returns empty list", async () => {
    const stripe = makeFakeStripe(async () => ({ data: [] }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice({
        last_finalization_error: {
          code: "invoice_no_payment_method_types",
          message: "Invoice has no payment methods attached.",
        } as Stripe.Invoice.LastFinalizationError,
      })
    );

    expect(result).toEqual({
      code: "invoice_no_payment_method_types",
      message: "Invoice has no payment methods attached.",
    });
  });

  it("swallows invoicePayments.list errors and returns nulls when no last_finalization_error", async () => {
    const stripe = makeFakeStripe(async () => {
      throw new Error("Stripe network error");
    });

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice({ last_finalization_error: null })
    );

    expect(result).toEqual({ code: null, message: null });
  });

  it("swallows invoicePayments.list errors but still uses last_finalization_error if present", async () => {
    const stripe = makeFakeStripe(async () => {
      throw new Error("Stripe network error");
    });

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice({
        last_finalization_error: {
          code: "invoice_no_customer_balance_payment",
          message: "No customer balance payment available.",
        } as Stripe.Invoice.LastFinalizationError,
      })
    );

    expect(result).toEqual({
      code: "invoice_no_customer_balance_payment",
      message: "No customer balance payment available.",
    });
  });

  it("picks the most recent non-paid payment when multiple attempts exist", async () => {
    const stripe = makeFakeStripe(async () => ({
      data: [
        makePaymentEntry({
          status: "failed",
          created: 1_700_000_100,
          pi: {
            last_payment_error: {
              decline_code: "card_declined",
              message: "First attempt.",
            },
            latest_charge: null,
          },
        }),
        makePaymentEntry({
          status: "failed",
          created: 1_700_000_500,
          pi: {
            last_payment_error: {
              decline_code: "insufficient_funds",
              message: "Most recent attempt.",
            },
            latest_charge: null,
          },
        }),
      ],
    }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice()
    );

    expect(result).toEqual({
      code: "insufficient_funds",
      message: "Most recent attempt.",
    });
  });

  it("skips paid payments and uses the first non-paid one (newest first)", async () => {
    const stripe = makeFakeStripe(async () => ({
      data: [
        makePaymentEntry({
          status: "paid",
          created: 1_700_001_000,
          pi: {
            last_payment_error: null,
            latest_charge: null,
          },
        }),
        makePaymentEntry({
          status: "failed",
          created: 1_700_000_500,
          pi: {
            last_payment_error: {
              decline_code: "do_not_honor",
              message: "Do not honour.",
            },
            latest_charge: null,
          },
        }),
      ],
    }));

    const result = await extractInvoiceDeclineReason(
      stripe as unknown as Stripe,
      makeInvoice()
    );

    expect(result).toEqual({
      code: "do_not_honor",
      message: "Do not honour.",
    });
  });
});
