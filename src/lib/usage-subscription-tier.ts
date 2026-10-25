import type Stripe from "stripe";
import { USAGE_TIERS, type UsageTierId } from "./usage-billing-catalog";
import { usagePriceId } from "./usage-billing-config";

/** Paid capacity comes from one verified base/work pair, never editable metadata. */
export function usageTierFromSubscription(
  sub: Stripe.Subscription,
  env: NodeJS.ProcessEnv = process.env,
): UsageTierId {
  const items = sub.items.data;
  const idOf = (item: (typeof items)[number]) =>
    typeof item.price === "string" ? item.price : item.price.id;
  const tiers = Object.keys(USAGE_TIERS) as UsageTierId[];
  const bases = tiers.flatMap((tier) => {
    const id = usagePriceId("base", env, tier);
    return id ? items.filter((item) => idOf(item) === id).map((item) => ({ tier, item })) : [];
  });
  const work = tiers.flatMap((tier) => {
    const id = usagePriceId("work", env, tier);
    return id ? items.filter((item) => idOf(item) === id).map((item) => ({ tier, item })) : [];
  });
  if (
    bases.length !== 1 ||
    work.length !== 1 ||
    bases[0].tier !== work[0].tier ||
    bases[0].item.quantity !== 1
  )
    throw new Error("Usage subscription has an incompatible plan and work allowance.");
  return bases[0].tier;
}
