import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  extraAgentItems,
  extraAgentMutationIdempotencyKey,
  extraAgentQuantity,
  hasPendingSubscriptionUpdate,
  isExtraAgentSubscriptionItem,
  isStripePaymentRequiredError,
  reconciledStoredAgentCap,
} from "../src/lib/extra-agent-billing";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function item(input: {
  id: string;
  priceId: string;
  quantity?: number;
  lookupKey?: string | null;
  metadata?: Record<string, string>;
}): Stripe.SubscriptionItem {
  return {
    id: input.id,
    object: "subscription_item",
    billing_thresholds: null,
    created: 1,
    discounts: [],
    metadata: {},
    plan: {} as Stripe.Plan,
    price: {
      id: input.priceId,
      object: "price",
      active: true,
      billing_scheme: "per_unit",
      created: 1,
      currency: "usd",
      custom_unit_amount: null,
      livemode: true,
      lookup_key: input.lookupKey ?? null,
      metadata: input.metadata || {},
      nickname: null,
      product: "prod_extra",
      recurring: { interval: "month", interval_count: 1, meter: null, usage_type: "licensed" },
      tax_behavior: "unspecified",
      tiers_mode: null,
      transform_quantity: null,
      type: "recurring",
      unit_amount: 1500,
      unit_amount_decimal: "1500",
    },
    quantity: input.quantity ?? 1,
    subscription: "sub_123",
    tax_rates: [],
  } as Stripe.SubscriptionItem;
}

function subscription(
  items: Stripe.SubscriptionItem[],
  opts: { latestInvoice?: string | null; pendingUpdate?: unknown } = {},
): Stripe.Subscription {
  return {
    id: "sub_123",
    object: "subscription",
    application: null,
    application_fee_percent: null,
    automatic_tax: { disabled_reason: null, enabled: false, liability: null },
    billing_cycle_anchor: 1,
    billing_cycle_anchor_config: null,
    billing_mode: { type: "flexible" },
    billing_thresholds: null,
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    cancellation_details: { comment: null, feedback: null, reason: null },
    collection_method: "charge_automatically",
    created: 1,
    currency: "usd",
    customer: "cus_123",
    days_until_due: null,
    default_payment_method: null,
    default_source: null,
    default_tax_rates: [],
    description: null,
    discounts: [],
    ended_at: null,
    invoice_settings: { account_tax_ids: null, issuer: { type: "self" } },
    items: { object: "list", data: items, has_more: false, url: "/v1/subscription_items" },
    latest_invoice: opts.latestInvoice ?? "in_1",
    livemode: true,
    metadata: {},
    next_pending_invoice_item_invoice: null,
    on_behalf_of: null,
    pause_collection: null,
    payment_settings: {
      payment_method_options: null,
      payment_method_types: null,
      save_default_payment_method: "off",
    },
    pending_invoice_item_interval: null,
    pending_setup_intent: null,
    pending_update: opts.pendingUpdate as never,
    schedule: null,
    start_date: 1,
    status: "active",
    test_clock: null,
    transfer_data: null,
    trial_end: null,
    trial_settings: { end_behavior: { missing_payment_method: "create_invoice" } },
    trial_start: null,
  } as Stripe.Subscription;
}

describe("extra-agent Stripe settlement helpers", () => {
  it("recognizes current, metadata-tagged, fallback, and legacy lookup-key items", () => {
    expect(
      isExtraAgentSubscriptionItem(
        item({ id: "si_1", priceId: "price_current" }),
        "price_current",
      ),
    ).toBe(true);
    expect(
      isExtraAgentSubscriptionItem(
        item({
          id: "si_2",
          priceId: "price_retired",
          metadata: { wireline_addon_id: "extra_agent" },
        }),
        "price_current",
      ),
    ).toBe(true);
    expect(
      isExtraAgentSubscriptionItem(
        item({
          id: "si_3",
          priceId: "price_retired",
          lookupKey: "extra_agent_monthly_founder_2026_07_v3",
        }),
        "price_current",
      ),
    ).toBe(true);
    expect(
      isExtraAgentSubscriptionItem(
        item({ id: "si_4", priceId: "price_other" }),
        "price_current",
      ),
    ).toBe(false);
  });

  it("detects duplicate add-on lines and sums licensed quantity", () => {
    const items = [
      item({ id: "si_1", priceId: "price_current", quantity: 2 }),
      item({
        id: "si_2",
        priceId: "price_retired",
        quantity: 3,
        metadata: { wireline_addon_id: "extra_agent" },
      }),
    ];
    const matches = extraAgentItems(subscription(items), "price_current");
    expect(matches).toHaveLength(2);
    expect(extraAgentQuantity(matches)).toBe(5);
  });

  it("moves purchased capacity down immediately while preserving explicit grants", () => {
    // Plan 5 + old extras 3 + explicit admin grant 2 = stored 10.
    expect(
      reconciledStoredAgentCap({
        planMaxAgents: 5,
        currentExtraAgents: 3,
        targetExtraAgents: 1,
        storedMaxAgents: 10,
      }),
    ).toBe(8);
    expect(
      reconciledStoredAgentCap({
        planMaxAgents: 5,
        currentExtraAgents: 3,
        targetExtraAgents: 0,
        storedMaxAgents: 8,
      }),
    ).toBe(5);
  });

  it("deduplicates identical concurrent mutations but permits a repaired-payment retry", () => {
    const before = subscription([], { latestInvoice: "in_failed_1" });
    const same = extraAgentMutationIdempotencyKey({
      subscription: before,
      configuredPriceId: "price_current",
      currentQuantity: 0,
      targetQuantity: 2,
    });
    expect(
      extraAgentMutationIdempotencyKey({
        subscription: before,
        configuredPriceId: "price_current",
        currentQuantity: 0,
        targetQuantity: 2,
      }),
    ).toBe(same);
    expect(
      extraAgentMutationIdempotencyKey({
        subscription: subscription([], { latestInvoice: "in_failed_2" }),
        configuredPriceId: "price_current",
        currentQuantity: 0,
        targetQuantity: 2,
      }),
    ).not.toBe(same);
  });

  it("detects pending updates and Stripe collection failures", () => {
    expect(
      hasPendingSubscriptionUpdate(subscription([], { pendingUpdate: { expires_at: 123 } })),
    ).toBe(true);
    expect(isStripePaymentRequiredError({ statusCode: 402, type: "StripeCardError" })).toBe(true);
    expect(isStripePaymentRequiredError({ code: "card_declined" })).toBe(true);
    expect(isStripePaymentRequiredError(new Error("network unavailable"))).toBe(false);
  });
});

describe("extra-agent atomic route contract", () => {
  it("settles Stripe before Postgres and shadows the legacy write route", () => {
    const route = read("src/routes/extra-agent-billing-atomic-routes.ts");
    const registry = read("src/server/register-api-routes.ts");
    const atomicMount = 'app.use("/api/billing/extra-agents", extraAgentBillingAtomicRouter)';
    const broadBillingMount = 'app.use("/api", billingRouter)';

    expect(route).toContain("pg_advisory_xact_lock");
    expect(route).toContain('payment_behavior: "error_if_incomplete"');
    expect(route).toContain("stripe.subscriptions.retrieve(subscriptionId)");
    expect(route).toContain("verifiedQuantity !== target");
    expect(route).toContain("set({ extraAgents: quantity, maxAgents, updatedAt: new Date() })");
    expect(registry).toContain(atomicMount);
    expect(registry.indexOf(atomicMount)).toBeLessThan(registry.indexOf(broadBillingMount));
  });
});
