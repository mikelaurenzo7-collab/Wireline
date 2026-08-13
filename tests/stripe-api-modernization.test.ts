import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import {
  fulfillStripeCheckoutSession,
  isStripeCheckoutPaymentSettled,
} from "../src/lib/stripe-checkout-fulfillment";
import {
  STRIPE_API_VERSION,
  stripe,
  stripeCheckoutIntegrationIdentifier,
  stripeCheckoutTaxConfig,
  stripeInvoiceIdForCharge,
} from "../src/lib/stripe-helpers";

function checkout(paymentStatus: Stripe.Checkout.Session.PaymentStatus) {
  return { payment_status: paymentStatus } as Stripe.Checkout.Session;
}

function charge(input: {
  id?: string;
  invoice?: string | null;
  paymentIntent?: string | null;
}): Stripe.Charge {
  return {
    id: input.id ?? "ch_test",
    invoice: input.invoice,
    payment_intent: input.paymentIntent ?? null,
  } as unknown as Stripe.Charge;
}

function invoicePaymentPage(invoiceIds: string[]) {
  return {
    object: "list",
    data: invoiceIds.map((invoice, index) => ({
      id: `inpay_${index}`,
      invoice,
    })),
    has_more: false,
    url: "/v1/invoice_payments",
  } as unknown as Awaited<ReturnType<typeof stripe.invoicePayments.list>>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Stripe API modernization", () => {
  it("pins the SDK-matched current API version", () => {
    expect(STRIPE_API_VERSION).toBe("2026-07-29.dahlia");
  });

  it("creates flow-specific integration identifiers with eight random letters", () => {
    for (const flow of ["plan", "runtime_balance", "live_video"] as const) {
      expect(stripeCheckoutIntegrationIdentifier(flow)).toMatch(
        new RegExp(`^wireline_${flow}_[a-z]{8}$`),
      );
    }
  });

  it("keeps the identifier stable when Stripe idempotency reuses an operation", () => {
    const first = stripeCheckoutIntegrationIdentifier("plan", "operation-123");
    const retry = stripeCheckoutIntegrationIdentifier("plan", "operation-123");
    const different = stripeCheckoutIntegrationIdentifier("plan", "operation-456");

    expect(retry).toBe(first);
    expect(different).not.toBe(first);
    expect(first).toMatch(/^wireline_plan_[a-z]{8}$/);
  });

  it("defaults Automatic Tax off and enables it only through the exact opt-in", () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX_ENABLED", "false");
    expect(stripeCheckoutTaxConfig()).toEqual({});

    vi.stubEnv("STRIPE_AUTOMATIC_TAX_ENABLED", "true");
    expect(stripeCheckoutTaxConfig()).toEqual({ automatic_tax: { enabled: true } });

    vi.stubEnv("STRIPE_AUTOMATIC_TAX_ENABLED", "TRUE");
    expect(stripeCheckoutTaxConfig()).toEqual({});
  });

  it("treats paid and no-payment-required Checkout Sessions as settled", () => {
    expect(isStripeCheckoutPaymentSettled(checkout("paid"))).toBe(true);
    expect(isStripeCheckoutPaymentSettled(checkout("no_payment_required"))).toBe(true);
    expect(isStripeCheckoutPaymentSettled(checkout("unpaid"))).toBe(false);
  });

  it("does not project unpaid or unrelated subscription Checkouts", async () => {
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve");
    const unpaid = await fulfillStripeCheckoutSession({
      id: "cs_unpaid",
      mode: "subscription",
      payment_status: "unpaid",
      subscription: "sub_unpaid",
      metadata: { wireline_user_id: "user_test" },
    } as unknown as Stripe.Checkout.Session);
    const unrelated = await fulfillStripeCheckoutSession({
      id: "cs_unrelated",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_unrelated",
      metadata: {},
    } as unknown as Stripe.Checkout.Session);

    expect(unpaid).toMatchObject({ paymentSettled: false, subscriptionSynced: false });
    expect(unrelated).toMatchObject({ paymentSettled: true, subscriptionSynced: false });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("keeps compatibility with pre-Basil Charge invoice pointers", async () => {
    const list = vi.spyOn(stripe.invoicePayments, "list");

    await expect(
      stripeInvoiceIdForCharge(charge({ invoice: "in_legacy", paymentIntent: "pi_legacy" })),
    ).resolves.toBe("in_legacy");
    expect(list).not.toHaveBeenCalled();
  });

  it("joins current Charges to invoices through Invoice Payments", async () => {
    const list = vi
      .spyOn(stripe.invoicePayments, "list")
      .mockResolvedValue(invoicePaymentPage(["in_current"]));

    await expect(stripeInvoiceIdForCharge(charge({ paymentIntent: "pi_current" }))).resolves.toBe(
      "in_current",
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { type: "payment_intent", payment_intent: "pi_current" },
        status: "paid",
      }),
    );
  });

  it("fails closed when one payment ambiguously funds multiple invoices", async () => {
    vi.spyOn(stripe.invoicePayments, "list").mockResolvedValue(
      invoicePaymentPage(["in_one", "in_two"]),
    );

    await expect(
      stripeInvoiceIdForCharge(charge({ id: "ch_ambiguous", paymentIntent: "pi_many" })),
    ).rejects.toThrow(/multiple invoices/i);
  });

  it("returns null for a non-invoice Charge", async () => {
    vi.spyOn(stripe.invoicePayments, "list").mockResolvedValue(invoicePaymentPage([]));

    await expect(
      stripeInvoiceIdForCharge(charge({ paymentIntent: "pi_topup" })),
    ).resolves.toBeNull();
  });
});
