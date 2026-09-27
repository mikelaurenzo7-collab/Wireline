import { STRIPE_PLANS } from "./plan-catalog";

/** New-sale availability is an explicit opt-in for each plan and interval. */
export function launchCatalogReadiness(env: NodeJS.ProcessEnv = process.env) {
  const eligible = STRIPE_PLANS.filter(
    (plan) => plan.catalogFamily === "channels" && plan.checkoutAvailability === "available",
  );
  const intervals = eligible.flatMap((plan) =>
    (["month", "year"] as const).map((interval) => {
      const key = interval === "month" ? plan.priceIdEnv : plan.annualPriceIdEnv;
      return {
        plan_id: plan.id,
        interval,
        env_key: key!,
        configured: Boolean(key && env[key]?.trim()),
        channels: plan.channels,
      };
    }),
  );
  return {
    configured: intervals.filter((entry) => entry.configured),
    deferred: intervals.filter((entry) => !entry.configured),
  };
}
