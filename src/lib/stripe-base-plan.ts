import {
  STRIPE_PLANS,
  planById,
  planLookupKey,
  planPriceId,
  type StripePlan,
} from "./plan-catalog";

type StripeBasePlanPriceLike = {
  id?: string | null;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
};

type StripeSubscriptionLike = {
  items?: {
    data?: Array<{ price?: StripeBasePlanPriceLike | null }>;
  };
};

/**
 * Resolve only a paid base-plan price. Extra-agent and other add-on prices must
 * never determine subscription plan identity, even when Stripe returns an
 * add-on item before the base item.
 */
export function basePlanForStripePrice(
  price: StripeBasePlanPriceLike | null | undefined,
): StripePlan | null {
  if (!price || price.metadata?.wireline_addon_id) return null;

  const metadataPlan = planById(price.metadata?.wireline_plan_id);
  if (metadataPlan) return metadataPlan;

  const lookupKey = price.lookup_key?.trim() || null;
  if (lookupKey) {
    const lookupMatch = STRIPE_PLANS.find(
      (plan) =>
        planLookupKey(plan, "month") === lookupKey ||
        planLookupKey(plan, "year") === lookupKey,
    );
    if (lookupMatch) return lookupMatch;
  }

  const priceId = price.id?.trim() || null;
  if (!priceId) return null;
  return (
    STRIPE_PLANS.find(
      (plan) =>
        planPriceId(plan, "month") === priceId ||
        planPriceId(plan, "year") === priceId,
    ) || null
  );
}

export function basePlanFromStripeSubscription(
  subscription: StripeSubscriptionLike | null | undefined,
): StripePlan | null {
  for (const item of subscription?.items?.data ?? []) {
    const plan = basePlanForStripePrice(item.price);
    if (plan) return plan;
  }
  return null;
}
