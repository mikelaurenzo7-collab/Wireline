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
import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { addCredit } from "./credit-wallet";
import { planById } from "./plan-catalog";
import { annualAllowanceSliceReference } from "./runtime-allowance-slices";
import { drizzle, log } from "./server-context";
import { clampUnitInterval, runtimeAllowanceMovementUsd } from "./stripe-dispute-accounting";

export type SubscriptionBillingInterval = "month" | "year";

export function runtimeAllowanceUsdForPlan(
  planId: string | null | undefined,
  interval: SubscriptionBillingInterval = "month",
): number {
  const monthly = planById(planId)?.runtime_allowance_usd_monthly ?? 0;
  if (!(monthly > 0)) return 0;
  // Year stays the historical full-period amount. Refund fallbacks for a lump
  // grant posted before monthly slices still reverse the whole posted year.
  // New annual grants use annualAllowanceSliceReference and post one month.
  return Math.round(monthly * (interval === "year" ? 12 : 1) * 100) / 100;
}

async function legacyAnnualLumpExists(
  userId: string,
  billingPeriodReference: string,
): Promise<boolean> {
  const [row] = await drizzle
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.refType, "subscription_runtime_allowance"),
        eq(schema.creditLedger.refId, billingPeriodReference),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function grantSubscriptionRuntimeAllowance(
  userId: string,
  billingPeriodReference: string,
  planId: string | null | undefined,
  interval: SubscriptionBillingInterval = "month",
): Promise<void> {
  if (!userId || !billingPeriodReference) return;
  const monthlyUsd = planById(planId)?.runtime_allowance_usd_monthly ?? 0;
  if (!(monthlyUsd > 0)) return;
  let amountUsd = monthlyUsd;
  let reference = billingPeriodReference;
  if (interval === "year") {
    // A year already posted as one lump must not also receive monthly slices.
    if (await legacyAnnualLumpExists(userId, billingPeriodReference)) return;
    const slice = annualAllowanceSliceReference(billingPeriodReference);
    if (!slice) return;
    reference = slice;
  }

  const { applied } = await addCredit(userId, amountUsd, "subscription_runtime_allowance", {
    type: "subscription_runtime_allowance",
    id: reference,
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
      reference,
      applied,
    });
  }
}

/**
 * Post the current month's slice when a customer spends or opens usage.
 * The subscription webhook posts the first slice; later months do not wait
 * for another Stripe event. A pre-slice annual lump is left untouched.
 */
export async function ensureCurrentRuntimeAllowance(userId: string): Promise<void> {
  if (!userId) return;
  const [subscription] = await drizzle
    .select({
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
      subscriptionId: schema.subscriptions.stripeSubscriptionId,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  if (
    !subscription?.subscriptionId ||
    subscription.status !== "active" ||
    !(planById(subscription.plan)?.runtime_allowance_usd_monthly > 0)
  ) {
    return;
  }
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() <= Date.now()) {
    return;
  }

  const [latest] = await drizzle
    .select({
      reference: schema.creditLedger.refId,
      metadata: schema.creditLedger.metadata,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.refType, "subscription_runtime_allowance"),
        sql`${schema.creditLedger.refId} like ${`${subscription.subscriptionId}:%`}`,
      ),
    )
    .orderBy(desc(schema.creditLedger.createdAt))
    .limit(1);
  if (!latest?.reference) return;
  const metadata = latest.metadata as { billing_interval?: unknown } | null;
  const interval: SubscriptionBillingInterval =
    metadata?.billing_interval === "year" ? "year" : "month";
  const sliceMarker = ":slice:";
  const base = latest.reference.includes(sliceMarker)
    ? latest.reference.slice(0, latest.reference.indexOf(sliceMarker))
    : latest.reference;
  await grantSubscriptionRuntimeAllowance(userId, base, subscription.plan, interval);
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
