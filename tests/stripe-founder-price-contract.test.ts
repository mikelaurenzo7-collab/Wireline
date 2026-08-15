import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FOUNDER_CATALOG_VERSION, planById, planLookupKey } from "../src/lib/plan-catalog";
import {
  resolveStrictFounderPriceId,
  stripePriceMatchesFounderPlan,
} from "../src/lib/stripe-founder-price";

const starter = planById("starter")!;

function validPrice(
  interval: "month" | "year" = "month",
  overrides: Record<string, unknown> = {},
): Stripe.Price {
  return {
    id: `price_starter_${interval}`,
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    created: 0,
    currency: "usd",
    custom_unit_amount: null,
    livemode: true,
    lookup_key: planLookupKey(starter, interval),
    metadata: {
      wireline_plan_id: starter.id,
      wireline_catalog_version: FOUNDER_CATALOG_VERSION,
    },
    nickname: null,
    product: {
      id: "prod_starter",
      object: "product",
      active: true,
      created: 0,
      default_price: null,
      description: null,
      images: [],
      livemode: true,
      marketing_features: [],
      metadata: {
        wireline_plan_id: starter.id,
        wireline_catalog_version: FOUNDER_CATALOG_VERSION,
      },
      name: starter.name,
      package_dimensions: null,
      shippable: null,
      statement_descriptor: null,
      tax_code: null,
      type: "service",
      unit_label: null,
      updated: 0,
      url: null,
    },
    recurring: {
      interval,
      interval_count: 1,
      meter: null,
      trial_period_days: null,
      usage_type: "licensed",
    },
    tax_behavior: "unspecified",
    tiers_mode: null,
    transform_quantity: null,
    type: "recurring",
    unit_amount: (interval === "year" ? starter.price_usd_annual : starter.price_usd_monthly) * 100,
    unit_amount_decimal: String(
      (interval === "year" ? starter.price_usd_annual : starter.price_usd_monthly) * 100,
    ),
    ...overrides,
  } as Stripe.Price;
}

function fakeClient(prices: Stripe.Price[], hasMore = false): Pick<Stripe, "prices"> {
  return {
    prices: {
      retrieve: vi.fn(async () => prices[0]),
      list: vi.fn(async () => ({
        object: "list",
        data: prices,
        has_more: hasMore,
        url: "/v1/prices",
      })),
    },
  } as unknown as Pick<Stripe, "prices">;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("strict Stripe founder-price contract", () => {
  it("accepts only the exact live amount, currency, interval, lookup, and product", () => {
    expect(stripePriceMatchesFounderPlan(validPrice(), starter, "month")).toBe(true);

    const invalid = [
      validPrice("month", { unit_amount: 1 }),
      validPrice("month", { currency: "eur" }),
      validPrice("month", {
        recurring: { ...validPrice().recurring, interval: "year" },
      }),
      validPrice("month", { lookup_key: "wrong_lookup" }),
      validPrice("month", { billing_scheme: "tiered" }),
      validPrice("month", {
        recurring: { ...validPrice().recurring, interval_count: 2 },
      }),
      validPrice("month", {
        recurring: { ...validPrice().recurring, trial_period_days: 30 },
      }),
      validPrice("month", {
        product: { ...(validPrice().product as Stripe.Product), name: "Wrong product" },
      }),
      validPrice("month", {
        product: { ...(validPrice().product as Stripe.Product), active: false },
      }),
      validPrice("month", {
        product: { ...(validPrice().product as Stripe.Product), livemode: false },
      }),
    ];

    for (const price of invalid) {
      expect(stripePriceMatchesFounderPlan(price, starter, "month")).toBe(false);
    }
  });

  it("uses one exact expanded lookup match and rejects duplicate or truncated results", async () => {
    vi.stubEnv(starter.priceIdEnv!, "");
    const price = validPrice();

    await expect(
      resolveStrictFounderPriceId("starter", "month", fakeClient([price])),
    ).resolves.toBe(price.id);
    await expect(
      resolveStrictFounderPriceId("starter", "month", fakeClient([price, { ...price }])),
    ).resolves.toBeNull();
    await expect(
      resolveStrictFounderPriceId("starter", "month", fakeClient([price], true)),
    ).resolves.toBeNull();
  });

  it("treats a configured id as a validated hint and safely falls back", async () => {
    vi.stubEnv(starter.priceIdEnv!, "price_wrong");
    const wrong = validPrice("month", { id: "price_wrong", unit_amount: 99_999 });
    const exact = validPrice();
    const client = fakeClient([wrong]);
    vi.mocked(client.prices.list).mockResolvedValueOnce({
      object: "list",
      data: [exact],
      has_more: false,
      url: "/v1/prices",
    });

    await expect(resolveStrictFounderPriceId("starter", "month", client)).resolves.toBe(exact.id);
    expect(client.prices.retrieve).toHaveBeenCalledWith("price_wrong", { expand: ["product"] });
    expect(client.prices.list).toHaveBeenCalledWith(
      expect.objectContaining({ expand: ["data.product"], limit: 100 }),
    );
  });

  it("refuses free, retired, and unknown plans before Stripe", async () => {
    const client = fakeClient([validPrice()]);
    await expect(resolveStrictFounderPriceId("personal", "month", client)).resolves.toBeNull();
    await expect(resolveStrictFounderPriceId("enterprise", "month", client)).resolves.toBeNull();
    await expect(resolveStrictFounderPriceId("unknown", "month", client)).resolves.toBeNull();
    expect(client.prices.list).not.toHaveBeenCalled();
  });
});
