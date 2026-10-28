import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { usageTierFromSubscription } from "../src/lib/usage-subscription-tier";
import { USAGE_TIER_PRICE_ENV } from "../src/lib/usage-billing-config";
import { PUBLIC_USAGE_TIERS, USAGE_TIERS } from "../src/lib/usage-billing-catalog";

const env = Object.fromEntries(
  Object.entries(USAGE_TIER_PRICE_ENV).flatMap(([tier, values]) =>
    Object.entries(values).map(([kind, name]) => [name, `price_${tier}_${kind}`]),
  ),
);
function subscription(prices: string[], quantity = 1, metadata = {}) {
  return {
    metadata,
    items: { data: prices.map((id) => ({ price: { id }, quantity })) },
  } as unknown as Stripe.Subscription;
}
describe("usage subscription tier identity", () => {
  it.each(Object.keys(USAGE_TIERS))("resolves %s from one actual base and work price", (tier) => {
    expect(
      usageTierFromSubscription(
        subscription([`price_${tier}_base`, `price_${tier}_work`], 1, { usage_tier: "plus" }),
        env,
      ),
    ).toBe(tier);
  });
  it.each(PUBLIC_USAGE_TIERS)("rejects mismatched, duplicate or missing %s charges", (tier) => {
    const otherTier = PUBLIC_USAGE_TIERS.find((candidate) => candidate !== tier)!;
    for (const prices of [
      [`price_${tier}_base`],
      [`price_${tier}_work`],
      [`price_${tier}_base`, `price_${otherTier}_work`],
      [`price_${tier}_base`, `price_${tier}_work`, `price_${otherTier}_base`],
      [`price_${tier}_base`, `price_${tier}_work`, `price_${tier}_work`],
    ])
      expect(() => usageTierFromSubscription(subscription(prices), env)).toThrow(/incompatible/);
    expect(() =>
      usageTierFromSubscription(subscription([`price_${tier}_base`, `price_${tier}_work`], 2), env),
    ).toThrow(/incompatible/);
  });
  it("continues to allow separately priced add-ons beside a valid base and work pair", () => {
    expect(
      usageTierFromSubscription(
        subscription(["price_lite_base", "price_lite_work", "price_number_addon"]),
        env,
      ),
    ).toBe("lite");
  });
  it("refuses an unknown configuration instead of granting the cheapest allowance", () => {
    expect(() => usageTierFromSubscription(subscription(["price_unknown"]), {})).toThrow();
  });
});
