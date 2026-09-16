import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "../src/lib/server-context";
import { stripe } from "../src/lib/stripe-helpers";
import { planPriceId, STRIPE_PLANS } from "../src/lib/plan-catalog";
import * as allowance from "../src/lib/subscription-welcome-credit";
import { reverseSubscriptionRuntimeAllowanceForChargeStrict } from "../src/middleware/stripe-runtime-allowance-retry";

const USER = "00000000-0000-4000-8000-000000000001";
const plan = STRIPE_PLANS.find((entry) => entry.id === "business")!;
let invoice: Record<string, unknown>;
const charge = {
  id: "ch_invoice_test",
  invoice: "in_test",
  payment_intent: "pi_test",
  amount: 4000,
  amount_refunded: 1000,
} as unknown as Stripe.Charge;

beforeEach(() => {
  invoice = {
    id: "in_test",
    customer: "cus_test",
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_current" } },
    lines: {
      data: [
        {
          amount: 4000,
          pricing: { type: "price_details", price_details: { price: planPriceId(plan, "month") } },
        },
      ],
    },
  };
  vi.spyOn(stripe.invoices, "retrieve").mockImplementation(
    async () => invoice as unknown as Stripe.Response<Stripe.Invoice>,
  );
  vi.spyOn(stripe.subscriptions, "retrieve").mockImplementation(
    async (id) =>
      ({
        id,
        customer: "cus_test",
        items: {
          data: [{ price: { id: planPriceId(plan, "month"), recurring: { interval: "month" } } }],
        },
      }) as unknown as Stripe.Response<Stripe.Subscription>,
  );
  vi.spyOn(stripe.refunds, "list").mockResolvedValue({
    data: [{ id: "re_partial", status: "succeeded", amount: 1000 }],
    has_more: false,
  } as unknown as Awaited<ReturnType<typeof stripe.refunds.list>>);
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([{ userId: USER }]),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  vi.spyOn(drizzle, "select").mockReturnValue(
    query as unknown as ReturnType<typeof drizzle.select>,
  );
  vi.spyOn(allowance, "reverseSubscriptionRuntimeAllowance").mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("subscription allowance recovery with current Stripe invoices", () => {
  it("reverses a settled partial refund using the current invoice parent", async () => {
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(
        charge,
        "refund",
        undefined,
        undefined,
        "evt_refund",
      ),
    ).resolves.toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_current");
    expect(allowance.reverseSubscriptionRuntimeAllowance).toHaveBeenCalledWith(
      USER,
      "re_partial",
      plan.id,
      "month",
      "refund",
      0.25,
      { providerEventId: "evt_refund", providerObjectId: "re_partial" },
    );
  });

  it("supports an expanded subscription in the current invoice parent", async () => {
    invoice.parent = {
      type: "subscription_details",
      subscription_details: { subscription: { id: "sub_expanded" } },
    };
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(
        charge,
        "dispute",
        "dp_test",
        2000,
        "evt_dispute",
      ),
    ).resolves.toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_expanded");
    expect(allowance.reverseSubscriptionRuntimeAllowance).toHaveBeenCalledWith(
      USER,
      "dp_test",
      plan.id,
      "month",
      "dispute",
      0.5,
      { providerEventId: "evt_dispute", providerObjectId: "dp_test" },
    );
  });

  it("continues to process older invoice subscription pointers", async () => {
    delete invoice.parent;
    invoice.subscription = "sub_legacy";
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund"),
    ).resolves.toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_legacy");
  });

  it("prefers the current parent over a stale legacy pointer", async () => {
    invoice.subscription = "sub_stale";
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund"),
    ).resolves.toBe(true);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_current");
  });

  it("does not debit subscription allowance for a non-subscription invoice", async () => {
    invoice.parent = { type: "quote_details", quote_details: { quote: "qt_test" } };
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund"),
    ).resolves.toBe(false);
    expect(allowance.reverseSubscriptionRuntimeAllowance).not.toHaveBeenCalled();
  });

  it("keeps malformed subscription linkage retryable rather than acknowledging a skipped refund", async () => {
    invoice.parent = { type: "subscription_details", subscription_details: {} };
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund"),
    ).rejects.toThrow(/subscription/i);
    expect(allowance.reverseSubscriptionRuntimeAllowance).not.toHaveBeenCalled();
  });
});
