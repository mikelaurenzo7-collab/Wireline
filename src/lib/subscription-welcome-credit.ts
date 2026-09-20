/**
 * Subscription-funded BotBound Runtime Allowance.
 *
 * Voice minutes remain separately guaranteed by the plan. This grant funds
 * optional SMS and generated business artifacts without allowing those
 * workloads to consume the customer's guaranteed phone capacity. Platform AI,
 * live research, and enrichment are funded by the plan's included AI-spend
 * envelope instead (plan-entitlements), where every platform provider call is
 * metered.
 */
import { addCredit } from "./credit-wallet";
import { planById } from "./plan-catalog";
import { log } from "./server-context";
import { clampUnitInterval, runtimeAllowanceMovementUsd } from "./stripe-dispute-accounting";

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

  const { applied } = await addCredit(userId, amountUsd, "subscription_runtime_allowance", {
    type: "subscription_runtime_allowance",
    id: billingPeriodReference,
    entryKind: "grant",
    source: "stripe",
    provider: "stripe",
    customerReason: "Included BotBound Runtime Allowance",
    metadata: {
      plan_id: planId,
      billing_interval: interval,
      runtime_allowance_usd: amountUsd,
      voice_capacity_separate: true,
    },
  });

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

export async function reverseSubscriptionRuntimeAllowance(
  userId: string,
  reversalReference: string,
  planId: string | null | undefined,
  interval: SubscriptionBillingInterval = "month",
  reason: "refund" | "dispute" = "refund",
  portion = 1,
  provenance?: {
    providerEventId?: string;
    providerObjectId?: string;
  },
  originalGrant?: { amountUsd: number; reference: string },
): Promise<void> {
  if (!userId || !reversalReference) return;
  const clampedPortion = clampUnitInterval(portion, 1);
  const amountUsd = runtimeAllowanceMovementUsd(
    originalGrant?.amountUsd ?? runtimeAllowanceUsdForPlan(planId, interval),
    clampedPortion,
  );
  if (!(amountUsd > 0)) return;

  const { reverseCredit } = await import("./credit-wallet");
  const { applied } = await reverseCredit(
    userId,
    amountUsd,
    "subscription_runtime_allowance_reversal",
    {
      type: "subscription_runtime_allowance_reversal",
      id: reversalReference,
      entryKind: "reversal",
      source: "stripe",
      provider: "stripe",
      providerEventId: provenance?.providerEventId,
      providerObjectId: provenance?.providerObjectId ?? reversalReference,
      customerReason:
        reason === "dispute"
          ? "Runtime Allowance reversed after a payment dispute"
          : "Runtime Allowance reversed after a refund",
      metadata: {
        plan_id: planId,
        billing_interval: interval,
        runtime_allowance_usd: amountUsd,
        reversal_portion: clampedPortion,
        reversal_reason: reason,
        ...(originalGrant ? { grant_reference: originalGrant.reference } : {}),
      },
    },
  );

  if (applied > 0) {
    log.info("subscription runtime allowance reversed", {
      userId,
      planId,
      interval,
      reversalReference,
      reason,
      applied,
    });
  }
}

export async function grantWelcomeSubscriptionCredit(
  userId: string,
  subscriptionId: string,
  planId: string | null | undefined,
): Promise<void> {
  return grantSubscriptionRuntimeAllowance(userId, subscriptionId, planId, "month");
}
