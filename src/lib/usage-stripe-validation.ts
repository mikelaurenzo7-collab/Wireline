import type Stripe from "stripe";
import {
  USAGE_STRIPE_PLANS,
  validateUsageMeter,
  validateUsagePrice,
} from "../../scripts/stripe-usage-billing-setup.mjs";
import { usageMeterEventName, usagePriceId } from "./usage-billing-config";
import type { UsageTierId } from "./usage-billing-catalog";

/** Refuse checkout if configured objects differ from the public rate card. */
export async function validateUsageCheckoutCatalog(
  client: Stripe,
  env: NodeJS.ProcessEnv = process.env,
  tier: UsageTierId = "starter",
): Promise<void> {
  const USAGE_STRIPE_PLAN = USAGE_STRIPE_PLANS[tier];
  const specs = [
    { key: "base" as const, spec: USAGE_STRIPE_PLAN.base },
    ...USAGE_STRIPE_PLAN.meters.map((spec) => ({ key: "work" as const, spec })),
    ...USAGE_STRIPE_PLAN.addons.map((spec) => ({
      key: spec.key as "number" | "email_address",
      spec,
    })),
  ];
  const prices = await Promise.all(
    specs.map(async ({ key, spec }) => {
      const id = usagePriceId(key, env, tier);
      if (!id) throw new Error(`Usage price ${key} is missing`);
      return { key, spec, price: await client.prices.retrieve(id, { expand: ["tiers"] }) };
    }),
  );
  const base = prices[0].price;
  const productId = typeof base.product === "string" ? base.product : base.product.id;
  const product = await client.products.retrieve(productId);
  if (product.deleted || !product.active || product.metadata.wireline_product !== "usage")
    throw new Error("Usage product is not active");
  for (const { key, spec, price } of prices) {
    if ("tiers" in spec) {
      const meterId = price.recurring?.meter;
      if (!meterId) throw new Error(`Usage price ${key} has no meter`);
      validateUsageMeter(await client.billing.meters.retrieve(meterId), {
        ...spec,
        event_name: usageMeterEventName("call_minutes", env),
      });
      validateUsagePrice(price, spec, { productId, meterId });
    } else validateUsagePrice(price, spec, { productId });
  }
}
