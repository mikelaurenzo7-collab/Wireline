import type Stripe from "stripe";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  select: vi.fn(),
  reverseCredit: vi.fn(),
  addCredit: vi.fn(),
  completeClaim: vi.fn(),
  releaseClaim: vi.fn(),
  grants: [] as Array<Record<string, unknown>>,
  tenantRun: vi.fn((_userId: string, work: () => unknown) => work()),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: harness.select },
  tenantStore: { run: harness.tenantRun },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLogger: {},
}));
vi.mock("../src/lib/credit-wallet", () => ({
  reverseCredit: harness.reverseCredit,
  addCredit: harness.addCredit,
}));
vi.mock("../src/lib/stripe-event-claim", () => ({
  claimStripeEvent: vi.fn(async () => ({ kind: "claimed", claim: { eventId: "evt_restore" } })),
  completeStripeEventClaim: harness.completeClaim,
  releaseStripeEventClaim: harness.releaseClaim,
}));

import { STRIPE_PLANS } from "../src/lib/plan-catalog";
import { stripe, stripeSubscriptionIdForInvoice } from "../src/lib/stripe-helpers";
import * as stripeHelpers from "../src/lib/stripe-helpers";
import {
  reverseSubscriptionRuntimeAllowanceForChargeStrict,
  stripeRuntimeAllowanceRetryPreflight,
} from "../src/middleware/stripe-runtime-allowance-retry";

const basePrice = STRIPE_PLANS.find((plan) => plan.id === "starter")!.fallbackPriceId!;
const invoice = (fields: Record<string, unknown>): Stripe.Invoice =>
  ({
    id: "in_current",
    customer: "cus_owner",
    lines: {
      data: [
        {
          amount: 1900,
          period: { start: 1788220800, end: 1790812800 },
          pricing: { type: "price_details", price_details: { price: basePrice } },
        },
      ],
    },
    ...fields,
  }) as unknown as Stripe.Invoice;

beforeEach(() => {
  vi.clearAllMocks();
  harness.select.mockImplementation((fields: Record<string, unknown>) => ({
    from: () => ({
      where: () => ({
        limit: async () =>
          "reference" in fields
            ? harness.grants
            : "deltaUsd" in fields
              ? [{ deltaUsd: "-1.23" }]
              : [{ userId: "owner" }],
      }),
    }),
  }));
  harness.grants = [
    {
      reference: "sub_current:1788220800",
      amountUsd: "1.00",
      metadata: { plan_id: "starter", billing_interval: "month" },
    },
  ];
  harness.reverseCredit.mockResolvedValue({ applied: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Stripe invoice subscription linkage", () => {
  it.each(["sub_current", { id: "sub_current" }])(
    "reads current parent pointers: %j",
    (subscription) => {
      expect(
        stripeSubscriptionIdForInvoice(
          invoice({
            parent: { type: "subscription_details", subscription_details: { subscription } },
            subscription: "sub_stale_legacy",
          }),
        ),
      ).toBe("sub_current");
    },
  );

  it.each(["sub_legacy", { id: "sub_legacy" }])(
    "retains historical pointers: %j",
    (subscription) => {
      expect(stripeSubscriptionIdForInvoice(invoice({ subscription }))).toBe("sub_legacy");
    },
  );

  it("leaves standalone invoices outside subscription accounting", () => {
    expect(stripeSubscriptionIdForInvoice(invoice({ parent: null }))).toBeNull();
    expect(
      stripeSubscriptionIdForInvoice(invoice({ parent: { type: "quote_details" } })),
    ).toBeNull();
  });
});

describe("subscription Runtime Allowance reversals with current Stripe invoices", () => {
  const charge = {
    id: "ch_current",
    invoice: "in_current",
    amount: 1900,
    amount_refunded: 950,
  } as unknown as Stripe.Charge;

  function configureInvoice(
    parent: unknown = {
      type: "subscription_details",
      subscription_details: { subscription: "sub_current" },
    },
  ) {
    vi.spyOn(stripe.invoices, "retrieve").mockResolvedValue(invoice({ parent }) as never);
    const subscription = vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({
      id: "sub_current",
      items: { data: [{ price: { id: basePrice, recurring: { interval: "month" } } }] },
    } as never);
    return subscription;
  }

  it("reverses a settled partial refund instead of acknowledging it without a debit", async () => {
    const subscription = configureInvoice();
    vi.spyOn(stripe.refunds, "list").mockResolvedValue({
      data: [{ id: "re_half", amount: 950, status: "succeeded" }],
      has_more: false,
    } as never);

    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(
        charge,
        "refund",
        undefined,
        undefined,
        "evt_refund",
      ),
    ).resolves.toBe(true);
    expect(subscription).not.toHaveBeenCalled();
    expect(harness.tenantRun).toHaveBeenCalledWith("owner", expect.any(Function));
    expect(harness.reverseCredit).toHaveBeenCalledExactlyOnceWith(
      "owner",
      0.5,
      "subscription_runtime_allowance_reversal",
      expect.objectContaining({
        type: "subscription_runtime_allowance_reversal",
        id: "re_half",
        providerEventId: "evt_refund",
        providerObjectId: "re_half",
      }),
    );
  });

  it("reverses a dispute withdrawal from an expanded current subscription pointer", async () => {
    configureInvoice({
      type: "subscription_details",
      subscription_details: { subscription: { id: "sub_current" } },
    });
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(
        charge,
        "dispute",
        "dp_current",
        1900,
        "evt_dispute",
      ),
    ).resolves.toBe(true);
    expect(harness.reverseCredit).toHaveBeenCalledExactlyOnceWith(
      "owner",
      1,
      "subscription_runtime_allowance_reversal",
      expect.objectContaining({
        type: "subscription_runtime_allowance_reversal",
        id: "dp_current",
        providerEventId: "evt_dispute",
        providerObjectId: "dp_current",
      }),
    );
  });

  it("does not mutate allowance for a standalone invoice", async () => {
    const subscription = configureInvoice(null);
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund"),
    ).resolves.toBe(false);
    expect(subscription).not.toHaveBeenCalled();
    expect(harness.reverseCredit).not.toHaveBeenCalled();
  });

  it("uses posted dollars after the same subscription changes plan and interval", async () => {
    const subscription = configureInvoice();
    subscription.mockResolvedValue({
      id: "sub_current",
      items: {
        data: [
          {
            price: {
              id: STRIPE_PLANS.find((plan) => plan.id === "business")!.fallbackAnnualPriceId,
              recurring: { interval: "year" },
            },
          },
        ],
      },
    } as never);
    // This historical grant can also predate a catalog allowance change.
    harness.grants[0].amountUsd = "1.23";
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue(
      invoice({ subscription: "sub_current" }) as never,
    );
    await reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "dispute", "dp_old", 950);
    expect(harness.reverseCredit).toHaveBeenCalledExactlyOnceWith(
      "owner",
      0.61,
      "subscription_runtime_allowance_reversal",
      expect.objectContaining({
        metadata: expect.objectContaining({
          plan_id: "starter",
          billing_interval: "month",
          grant_reference: "sub_current:1788220800",
        }),
      }),
    );
    expect(subscription).not.toHaveBeenCalled();
  });

  it("restores only the original grant's portion after dispute funds return", async () => {
    configureInvoice();
    harness.grants[0].amountUsd = "1.23";
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-only");
    vi.spyOn(stripeHelpers, "stripeAvailable").mockReturnValue(true);
    vi.spyOn(stripe.webhooks, "constructEvent").mockReturnValue({
      id: "evt_restore",
      type: "charge.dispute.funds_reinstated",
      data: { object: { id: "dp_old" } },
    } as Stripe.Event);
    vi.spyOn(stripe.disputes, "retrieve").mockResolvedValue({
      id: "dp_old",
      amount: 1900,
      currency: "usd",
      charge: "ch_current",
      balance_transactions: [
        { amount: -1900, currency: "usd" },
        { amount: 950, currency: "usd" },
      ],
    } as never);
    vi.spyOn(stripe.charges, "retrieve").mockResolvedValue(charge as never);
    const json = vi.fn();
    const next = vi.fn();
    await stripeRuntimeAllowanceRetryPreflight(
      {
        method: "POST",
        headers: { "stripe-signature": "test-signature" },
        body: Buffer.from("{}"),
      } as Request,
      { json } as unknown as Response,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(harness.addCredit).toHaveBeenCalledExactlyOnceWith(
      "owner",
      0.61,
      "subscription_runtime_allowance_dispute_restored",
      expect.objectContaining({
        type: "subscription_runtime_allowance_dispute_restoration",
        id: "dp_old",
      }),
    );
    expect(harness.completeClaim).toHaveBeenCalledOnce();
    expect(harness.releaseClaim).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledOnce();
  });

  it.each([{ grants: [] }, { grants: [{ reference: "one" }, { reference: "two" }] }])(
    "keeps a missing or ambiguous grant retryable: %j",
    async ({ grants }) => {
      configureInvoice();
      harness.grants = grants;
      await expect(
        reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "dispute", "dp_retry", 1900),
      ).rejects.toThrow(/unambiguous posted Runtime Allowance grant/);
      expect(harness.reverseCredit).not.toHaveBeenCalled();
    },
  );

  it("does not claw back a period grant for a same-period plan proration", async () => {
    configureInvoice();
    const prorationInvoice = invoice({
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_current" },
      },
    });
    prorationInvoice.lines.data[0].parent = {
      type: "subscription_item_details",
      subscription_item_details: { proration: true },
    } as never;
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue(prorationInvoice as never);
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "dispute", "dp_proration", 1900),
    ).resolves.toBe(false);
    expect(harness.select).not.toHaveBeenCalled();
    expect(harness.reverseCredit).not.toHaveBeenCalled();
  });

  it("acknowledges a refunded Calls plan invoice, which never funded a Runtime Allowance grant", async () => {
    vi.stubEnv("STRIPE_VOICE_PRICE_ID", "price_calls_light_monthly");
    configureInvoice();
    const callsInvoice = invoice({
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_current" },
      },
    });
    callsInvoice.lines.data[0].pricing = {
      type: "price_details",
      price_details: { price: "price_calls_light_monthly" },
    } as never;
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue(callsInvoice as never);
    harness.grants = [];

    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund"),
    ).resolves.toBe(false);
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "dispute", "dp_calls", 1900),
    ).resolves.toBe(false);
    expect(harness.reverseCredit).not.toHaveBeenCalled();
  });

  it("loads omitted invoice lines before identifying the funded period", async () => {
    configureInvoice();
    const complete = invoice({}).lines.data;
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue(
      invoice({
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_current" },
        },
        lines: { data: [], has_more: true },
      }) as never,
    );
    const lines = vi.spyOn(stripe.invoices, "listLineItems").mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield* complete;
      },
    } as never);
    await expect(
      reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "dispute", "dp_paged", 1900),
    ).resolves.toBe(true);
    expect(lines).toHaveBeenCalledWith("in_current", { limit: 100 });
    expect(harness.reverseCredit).toHaveBeenCalledOnce();
  });
});
