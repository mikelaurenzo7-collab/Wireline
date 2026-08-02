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
 * Claw the Runtime Allowance back when the subscription payment behind it is
 * refunded or disputed.
 *
 * Credit top-ups have been protected against this since round 4, but the
 * subscription path was not: charge.refunded / charge.dispute.created check for
 * `purpose === "credit_topup"` on the PaymentIntent, and a subscription invoice
 * PaymentIntent carries no such marker, so the handler simply broke out. A
 * refunded annual Business plan kept its $144 of Runtime Balance (v6 catalog:
 * $12/mo x 12) to spend as real provider work — ~7,200 SMS segments — on top
 * of the $1,590 already reversed.
 *
 * The reversal is keyed on the refund/dispute id rather than on the grant's own
 * period reference. That id is unique per event, so the (user, ref) ledger index
 * makes a redelivery idempotent, and a second partial refund reverses under its
 * own key instead of colliding with the first and being silently dropped.
 */
export async function reverseSubscriptionRuntimeAllowance(
  userId: string,
  reversalReference: string,
  planId: string | null | undefined,
  interval: SubscriptionBillingInterval = "month",
  reason: "refund" | "dispute" = "refund",
  /** Fraction of the charge actually refunded (0–1). A dispute holds the whole
   *  charge (1); a partial refund reverses only its share so cumulative partial
   *  reversals can never exceed the grant. Defaults to 1 for legacy callers. */
  portion = 1,
): Promise<void> {
  if (!userId || !reversalReference) return;
  const clampedPortion = Number.isFinite(portion)
    ? Math.min(1, Math.max(0, portion))
    : 1;
  // Round the reversed share DOWN to the cent so the sum of partial reversals
  // stays at or below the granted allowance.
  const amountUsd =
    Math.floor(
      runtimeAllowanceUsdForPlan(planId, interval) * clampedPortion * 100,
    ) / 100;
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

/**
 * Backward-compatible export for older call sites. It now grants the first period's
 * included runtime rather than a separate promotional credit.
 */
export async function grantWelcomeSubscriptionCredit(
  userId: string,
  subscriptionId: string,
  planId: string | null | undefined,
): Promise<void> {
  return grantSubscriptionRuntimeAllowance(
    userId,
    subscriptionId,
    planId,
    "month",
  );
}
