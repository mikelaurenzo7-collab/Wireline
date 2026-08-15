import type Stripe from "stripe";

import { FOUNDER_CATALOG_VERSION, planLookupKey, type StripePlan } from "./plan-catalog";

export type FounderBillingInterval = "month" | "year";

function expandedActiveProduct(price: Stripe.Price): Stripe.Product | null {
  if (typeof price.product === "string" || !price.product || "deleted" in price.product) {
    return null;
  }
  return price.product.active === true ? price.product : null;
}

/** Exact, reusable acceptance contract for one immutable founder-catalog price. */
export function stripePriceMatchesFounderPlan(
  price: Stripe.Price,
  plan: StripePlan,
  interval: FounderBillingInterval,
): boolean {
  const lookupKey = planLookupKey(plan, interval);
  const expectedAmount =
    (interval === "year" ? plan.price_usd_annual : plan.price_usd_monthly) * 100;
  const product = expandedActiveProduct(price);

  return Boolean(
    lookupKey &&
    price.active === true &&
    price.livemode === true &&
    price.billing_scheme === "per_unit" &&
    price.type === "recurring" &&
    price.currency === "usd" &&
    price.unit_amount === expectedAmount &&
    price.recurring?.interval === interval &&
    price.recurring?.interval_count === 1 &&
    price.recurring?.trial_period_days == null &&
    price.recurring?.usage_type === "licensed" &&
    price.lookup_key === lookupKey &&
    price.metadata?.wireline_plan_id === plan.id &&
    price.metadata?.wireline_catalog_version === FOUNDER_CATALOG_VERSION &&
    product &&
    product.livemode === true &&
    product.name === plan.name &&
    product.metadata?.wireline_plan_id === plan.id &&
    product.metadata?.wireline_catalog_version === FOUNDER_CATALOG_VERSION,
  );
}
