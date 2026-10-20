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
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

/**
 * Share of an annual period refunded or disputed and not later restored, in
 * [0, 1]. Reversals name the period's base reference as grant_reference; a
 * dispute restoration shares its reversal's reference id.
 */
async function withheldAnnualPortion(
  userId: string,
  billingPeriodReference: string,
): Promise<number> {
  const rows = await drizzle
    .select({
      refType: schema.creditLedger.refType,
      refId: schema.creditLedger.refId,
      metadata: schema.creditLedger.metadata,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        inArray(schema.creditLedger.refType, [
          "subscription_runtime_allowance_reversal",
          "subscription_runtime_allowance_dispute_restoration",
        ]),
      ),
    );
  const reversals = new Map<string, number>();
  const restorations = new Map<string, number>();
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (!row.refId) continue;
    if (row.refType === "subscription_runtime_allowance_reversal") {
      if (meta.grant_reference !== billingPeriodReference) continue;
      reversals.set(row.refId, clampUnitInterval(Number(meta.reversal_portion), 0));
    } else {
      restorations.set(row.refId, clampUnitInterval(Number(meta.restoration_portion), 0));
    }
  }
  let withheld = 0;
  for (const [refId, portion] of reversals) {
    withheld += Math.max(0, portion - (restorations.get(refId) ?? 0));
  }
  return Math.min(1, withheld);
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
    // Refunds and disputes reverse their portion of the slices already posted.
    // Later slices shrink by the same portion, so a refunded year stops funding
    // allowance and a partial refund withholds its share of every month.
    const withheld = await withheldAnnualPortion(userId, billingPeriodReference);
    amountUsd = Math.round(monthlyUsd * (1 - withheld) * 100) / 100;
    if (!(amountUsd > 0)) return;
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

const ALLOWANCE_CHECK_INTERVAL_MS = 10 * 60_000;
const ALLOWANCE_CHECK_MAX_ENTRIES = 10_000;
const allowanceCheckedAt = new Map<string, number>();

/** Test seam: forget which accounts were recently checked. */
export function resetRuntimeAllowanceCheckCache(): void {
  allowanceCheckedAt.clear();
}

/**
 * Post the current month's slice when a customer spends or opens usage.
 * The subscription webhook posts the first slice; later months do not wait
 * for another Stripe event. A pre-slice annual lump is left untouched.
 */
export async function ensureCurrentRuntimeAllowance(userId: string): Promise<void> {
  if (!userId) return;
  // This runs on the spend path. A new slice can appear at most once a month,
  // so each process checks a given account at most once per interval.
  const now = Date.now();
  if ((allowanceCheckedAt.get(userId) ?? 0) > now - ALLOWANCE_CHECK_INTERVAL_MS) return;
  allowanceCheckedAt.set(userId, now);
  if (allowanceCheckedAt.size > ALLOWANCE_CHECK_MAX_ENTRIES) {
    const oldest = allowanceCheckedAt.keys().next().value;
    if (oldest !== undefined) allowanceCheckedAt.delete(oldest);
  }
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
    !((planById(subscription.plan)?.runtime_allowance_usd_monthly ?? 0) > 0)
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
  // Monthly periods are granted by their invoice webhook; only annual slices
  // are posted here.
  if (metadata?.billing_interval !== "year") return;
  const interval: SubscriptionBillingInterval = "year";
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
