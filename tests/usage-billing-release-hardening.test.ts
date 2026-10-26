import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import type Stripe from "stripe";
import {
  assertUsageStripeAccount,
  USAGE_STRIPE_PLAN,
  validateUsageMeter,
  validateUsagePrice,
} from "../scripts/stripe-usage-billing-setup.mjs";
vi.mock("../src/lib/server-context", () => ({ drizzle: {}, log: { error: vi.fn() } }));
import { meterErrorScope } from "../src/lib/usage-billing-reconciliation";
import { stripeUsageIdentifier } from "../src/lib/usage-billing-ledger";
import { validateUsageCheckoutCatalog } from "../src/lib/usage-stripe-validation";
import { USAGE_PRICE_ENV } from "../src/lib/usage-billing-config";
const meterCreate = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/stripe-helpers", () => ({
  stripe: { billing: { meterEvents: { create: meterCreate } } },
}));
import { createStripeMeterClient } from "../src/lib/usage-billing-store";

describe("usage catalog validation", () => {
  it("permits an explicitly selected sandbox only in test mode", async () => {
    const client = { accounts: { retrieve: async () => ({ id: "acct_sandbox" }) } };
    await expect(
      assertUsageStripeAccount(client, { mode: "test", sandboxAccountId: "acct_sandbox" }),
    ).resolves.toBeUndefined();
    await expect(
      assertUsageStripeAccount(client, { mode: "live", sandboxAccountId: "acct_sandbox" }),
    ).rejects.toThrow();
    await expect(
      assertUsageStripeAccount(client, { mode: "test", sandboxAccountId: "acct_other" }),
    ).rejects.toThrow();
  });
  const spec = USAGE_STRIPE_PLAN.meters[0];
  const meter = () => ({
    status: "active",
    event_name: spec.event_name,
    default_aggregation: { formula: "sum" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
    value_settings: { event_payload_key: "value" },
  });
  const price = () => ({
    active: true,
    currency: "usd",
    type: "recurring",
    product: "prod_usage",
    tax_behavior: "exclusive",
    lookup_key: spec.lookup_key,
    recurring: { interval: "month", interval_count: 1, usage_type: "metered", meter: "mtr_usage" },
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    metadata: { wireline_usage_meter: spec.key, wireline_catalog_version: "2026-10-usage-v2" },
    tiers: spec.tiers.map((tier) => ({
      ...tier,
      up_to: tier.up_to === "inf" ? null : tier.up_to,
      flat_amount: null,
    })),
  });
  const context = { productId: "prod_usage", meterId: "mtr_usage" };
  it("accepts the exact catalog and rejects silent repricing, wrong meters, tax mode and inactive prices", () => {
    expect(() => validateUsagePrice(price(), spec, context)).not.toThrow();
    for (const patch of [
      { active: false },
      { tax_behavior: "inclusive" },
      { tiers_mode: "volume" },
      { product: "prod_other" },
      { recurring: { ...price().recurring, meter: "mtr_other" } },
      {
        tiers: price().tiers.map((tier, i) =>
          i === 1 ? { ...tier, unit_amount_decimal: "30" } : tier,
        ),
      },
    ])
      expect(() => validateUsagePrice({ ...price(), ...patch }, spec, context)).toThrow(
        "approved catalog",
      );
  });
  it("rejects incompatible aggregation, preaggregation windows and customer mappings", () => {
    expect(() => validateUsageMeter(meter(), spec)).not.toThrow();
    for (const patch of [
      { default_aggregation: { formula: "last" } },
      { event_time_window: "hour" },
      { customer_mapping: { type: "by_id", event_payload_key: "other" } },
    ])
      expect(() => validateUsageMeter({ ...meter(), ...patch }, spec)).toThrow("incompatible");
  });
  it("runs the dry-run CLI on this operating system without a credential", () => {
    const output = execFileSync(process.execPath, ["scripts/stripe-usage-billing-setup.mjs"], {
      encoding: "utf8",
      env: { ...process.env, STRIPE_SECRET_KEY: "" },
    });
    expect(output).toContain("DRY RUN");
    expect(output).toContain("STRIPE_USAGE_BASE_PRICE_ID");
  });
});

describe("checkout rate-card gate", () => {
  it("validates every offered object and rejects a mismatched optional add-on before checkout", async () => {
    const specs = [
      { key: "base", ...USAGE_STRIPE_PLAN.base },
      ...USAGE_STRIPE_PLAN.meters,
      ...USAGE_STRIPE_PLAN.addons,
    ];
    const env = Object.fromEntries(
      Object.entries(USAGE_PRICE_ENV).map(([key, name]) => [name, `price_${key}`]),
    );
    const prices = specs.map((spec) => {
      const tiered = "tiers" in spec;
      return {
        id: `price_${spec.key}`,
        active: true,
        currency: "usd",
        type: "recurring",
        product: "prod_usage",
        tax_behavior: "exclusive",
        lookup_key: spec.lookup_key,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: tiered ? "metered" : "licensed",
          ...(tiered ? { meter: `mtr_${spec.key}` } : {}),
        },
        billing_scheme: tiered ? "tiered" : "per_unit",
        ...(tiered
          ? {
              tiers_mode: "graduated",
              tiers: spec.tiers.map((tier) => ({
                ...tier,
                up_to: tier.up_to === "inf" ? null : tier.up_to,
              })),
            }
          : { unit_amount: spec.unit_amount }),
        metadata:
          "metadata" in spec
            ? spec.metadata
            : {
                wireline_catalog_version: "2026-10-usage-v2",
                ...(tiered
                  ? { wireline_usage_meter: spec.key }
                  : { wireline_addon_id: `usage_${spec.key}` }),
              },
      };
    });
    const client = {
      prices: { retrieve: vi.fn(async (id: string) => prices.find((price) => price.id === id)) },
      products: {
        retrieve: vi.fn(async () => ({ active: true, metadata: { wireline_product: "usage" } })),
      },
      billing: {
        meters: {
          retrieve: vi.fn(async (id: string) => ({
            status: "active",
            event_name: USAGE_STRIPE_PLAN.meters.find((meter) => `mtr_${meter.key}` === id)
              ?.event_name,
            default_aggregation: { formula: "sum" },
            customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
            value_settings: { event_payload_key: "value" },
          })),
        },
      },
    };
    await expect(
      validateUsageCheckoutCatalog(client as unknown as Stripe, env, "starter"),
    ).resolves.toBeUndefined();
    expect(client.prices.retrieve).toHaveBeenCalledTimes(4);
    prices.find((price) => price.id === "price_email_address")!.unit_amount = 999;
    await expect(
      validateUsageCheckoutCatalog(client as unknown as Stripe, env, "starter"),
    ).rejects.toThrow("approved catalog");
  });
});

describe("meter HTTP retry identity", () => {
  it("uses the frozen identifier as the HTTP key and propagates ambiguous duplicate errors", async () => {
    meterCreate.mockReset().mockResolvedValue({});
    const event = {
      eventName: "botbound_call_minutes",
      identifier: "usage:canonical",
      timestamp: new Date("2026-10-25T00:00:00Z"),
      stripeCustomerId: "cus_test",
      value: 1.5,
    };
    await createStripeMeterClient().send(event);
    expect(meterCreate).toHaveBeenCalledWith(
      {
        event_name: event.eventName,
        identifier: event.identifier,
        timestamp: 1792886400,
        payload: { stripe_customer_id: "cus_test", value: "1.5" },
      },
      { idempotencyKey: event.identifier },
    );
    meterCreate.mockRejectedValue(new Error("identifier already exists with different data"));
    await expect(createStripeMeterClient().send(event)).rejects.toThrow("different data");
  });
});

describe("asynchronous meter failures", () => {
  const notice = (count: number, ids: Array<string | undefined>) => ({
    id: "evt_error",
    type: "v1.billing.meter.error_report_triggered",
    data: {
      reason: {
        error_count: count,
        error_types: [
          {
            code: "invalid_value",
            error_count: count,
            sample_errors: ids.map((identifier) => ({ request: { identifier } })),
          },
        ],
      },
    },
  });
  it("treats partial, duplicate or unidentified samples as an incomplete affected set", () => {
    expect(meterErrorScope(notice(2, ["usage:1"])).complete).toBe(false);
    expect(meterErrorScope(notice(2, ["usage:1", "usage:1"])).complete).toBe(false);
    expect(meterErrorScope(notice(1, [undefined])).complete).toBe(false);
    expect(meterErrorScope(notice(2, ["usage:1", "usage:2"]))).toEqual({
      identifiers: ["usage:1", "usage:2"],
      complete: true,
    });
  });
  it("rejects malformed provider evidence", () => {
    expect(() => meterErrorScope(notice(0, []))).toThrow();
    expect(() => meterErrorScope({ ...notice(1, ["usage:1"]), type: "untrusted" })).toThrow();
  });
  it("preserves short identifiers and hashes long email receipt identities without collisions", () => {
    expect(stripeUsageIdentifier("usage:short")).toBe("usage:short");
    const source = `usage:emails_handled:email_reply:${"a".repeat(120)}`;
    expect(stripeUsageIdentifier(source).length).toBeLessThanOrEqual(100);
    expect(stripeUsageIdentifier(source)).toBe(stripeUsageIdentifier(source));
    expect(stripeUsageIdentifier(source)).not.toBe(stripeUsageIdentifier(source + "b"));
  });
});
