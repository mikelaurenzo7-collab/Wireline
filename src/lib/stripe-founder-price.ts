import type Stripe from "stripe";

import { planById, planLookupKey } from "./plan-catalog";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { stripe } from "./stripe-helpers";
import {
  stripePriceMatchesFounderPlan,
  type FounderBillingInterval,
} from "./stripe-founder-price-contract";

export { stripePriceMatchesFounderPlan } from "./stripe-founder-price-contract";

type StripePriceClient = Pick<Stripe, "prices">;

/**
 * Resolve a checkout price only when Stripe proves the complete live catalog
 * contract. Environment ids are hints; the immutable lookup key is the safe
 * fallback. Ambiguous/duplicate lookup results fail closed.
 */
export async function resolveStrictFounderPriceId(
  planId: string,
  interval: FounderBillingInterval,
  client: StripePriceClient = stripe,
): Promise<string | null> {
  const plan = planById(planId);
  if (!plan || plan.price_usd_monthly <= 0 || plan.public === false) return null;

  const envKey = interval === "year" ? plan.annualPriceIdEnv : plan.priceIdEnv;
  const envPriceId = envKey ? process.env[envKey]?.trim() : undefined;
  if (envPriceId) {
    try {
      const configured = await client.prices.retrieve(envPriceId, { expand: ["product"] });
      if (stripePriceMatchesFounderPlan(configured, plan, interval)) return configured.id;
      log.warn("Configured Stripe price failed the founder catalog contract; using lookup key", {
        planId: plan.id,
        interval,
        envKey,
      });
    } catch (error) {
      log.warn("Configured Stripe price could not be validated; using lookup key", {
        planId: plan.id,
        interval,
        envKey,
        error: getErrorMessage(error),
      });
    }
  }

  const lookupKey = planLookupKey(plan, interval);
  if (!lookupKey) return null;
  const listed = await client.prices.list({
    active: true,
    lookup_keys: [lookupKey],
    expand: ["data.product"],
    limit: 100,
  });
  if (listed.has_more) return null;

  const matches = listed.data.filter((price) =>
    stripePriceMatchesFounderPlan(price, plan, interval),
  );
  return matches.length === 1 ? matches[0].id : null;
}
