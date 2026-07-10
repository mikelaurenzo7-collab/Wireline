/**
 * Subscription-funded Wireline Runtime Allowance.
 *
 * Voice minutes remain separately guaranteed by the plan. This grant funds optional
 * SMS, platform AI/research, enrichment, and generated business artifacts without
 * allowing those workloads to consume the customer's guaranteed phone capacity.
 */
import { addCredit } from "./credit-wallet";
import { planById } from "./plan-catalog";
import { log } from "./server-context";

export type SubscriptionBillingInterval = "month" | "year";

export function runtimeAllowanceUsdForPlan(
  planId: string | null | undefined,
  interval: SubscriptionBillingInterval = "month",
): number {
  const monthly = planById(planId)?.runtime_allowance_usd_monthly ?? 0;
  if (!(monthly > 0)) return 0;
  return Math.round(monthly * (interval === "year" ? 12 : 1) * 100) / 100;
}

export async function grantSubscriptionRuntimeAllowance(
  userId: string,
  billingPeriodReference: string,
  planId: string | null | undefined,
  interval: SubscriptionBillingInterval = "month",
): Promise<void> {
  if (!userId || !billingPeriodReference) return;
  const amountUsd = runtimeAllowanceUsdForPlan(planId, interval);
  if (!(amountUsd > 0)) return;

  const { applied } = await addCredit(
    userId,
    amountUsd,
    "subscription_runtime_allowance",
    {
      type: "subscription_runtime_allowance",
      id: billingPeriodReference,
      entryKind: "grant",
      source: "stripe",
      provider: "stripe",
      customerReason: "Included Wireline Runtime Allowance",
      metadata: {
        plan_id: planId,
        billing_interval: interval,
        runtime_allowance_usd: amountUsd,
        voice_capacity_separate: true,
      },
    },
  );

  if (applied > 0) {
    log.info("subscription runtime allowance granted", {
      userId,
      planId,
      interval,
      billingPeriodReference,
      applied,
    });
  }
}

/**
 * Backward-compatible export for older call sites. It now grants the first period's
 * included runtime rather than a separate promotional credit.
 */
export async function grantWelcomeSubscriptionCredit(
  userId: string,
  subscriptionId: string,
  planId: string | null | undefined,
): Promise<void> {
  return grantSubscriptionRuntimeAllowance(userId, subscriptionId, planId, "month");
}
