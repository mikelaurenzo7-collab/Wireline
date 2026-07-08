/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Monthly voice-minute tracking + Stripe metered overage emission.
 *
 * Called once per completed Vapi call from the end-of-call webhook. Always
 * fail-OPEN: a downstream Stripe outage or DB blip must never block the
 * primary call-log insert path. All side effects are wrapped in try/catch
 * and logged.
 *
 * Storage:
 *   schema.quotaUsage rows with dimension="voice_minutes_monthly" and
 *   period_key="YYYY-MM" (current UTC month).
 *
 * Overage emission to Stripe:
 *   Gated on env var STRIPE_VOICE_OVERAGE_METER_EVENT_NAME. If unset,
 *   we still TRACK usage in our DB (so the UI can show it) but do NOT
 *   emit Stripe meter events. That lets you ship visible usage tonight
 *   and turn on metered billing later, after configuring the Stripe
 *   Meter + metered Price in the dashboard.
 */

import { eq, sql, and } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { planById } from "./plan-catalog";
import { emitVoiceMinuteOverageEvent } from "./stripe-helpers";
import { debitForOverage, debitForVoiceUsage } from "./credit-wallet";
import { isBalanceFundedVoicePlan } from "./voice-billing-policy";

const DIMENSION = "voice_minutes_monthly";

/** UTC year-month key, e.g. "2026-05". */
export function monthlyPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** First instant of the next UTC month (ISO string). */
export function nextMonthlyResetIso(now: Date = new Date()): string {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return t.toISOString();
}

export interface VoiceUsageSnapshot {
  plan_id: string | null;
  voice_minutes_used: number;
  voice_minutes_included: number;
  voice_minutes_remaining: number;
  overage_minutes: number;
  overage_per_min_usd: number;
  overage_cost_usd: number;
  period_key: string;
  reset_at: string;
  stripe_metered: boolean;
}

/**
 * Atomically increment the user's monthly counter and (if configured)
 * emit a Stripe meter event for the overage delta. Returns nothing —
 * caller fire-and-forgets.
 */
export async function trackVoiceMinutes(opts: {
  userId: string;
  durationSeconds: number;
  /**
   * Stable per-call identifier used to make the Stripe meter event
   * idempotent — Vapi retries (or any other duplicate invocation that
   * gets past the call_logs unique constraint) will collapse to a single
   * Stripe event because the identifier is deterministic.
   */
  vapiCallId: string;
}): Promise<void> {
  const { userId, durationSeconds, vapiCallId } = opts;
  if (!userId || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;

  // Round up — never under-bill, never charge for sub-minute fractions
  // in a way that confuses account holders. 30s → 1 min, 61s → 2 min.
  const minutes = Math.ceil(durationSeconds / 60);
  const periodKey = monthlyPeriodKey();

  try {
    // Atomic upsert returning the post-increment total.
    const upsertRows = (await drizzle
      .insert(schema.quotaUsage)
      .values({
        userId,
        dimension: DIMENSION,
        periodKey,
        used: BigInt(minutes),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.quotaUsage.userId,
          schema.quotaUsage.dimension,
          schema.quotaUsage.periodKey,
        ],
        set: {
          used: sql`${schema.quotaUsage.used} + ${BigInt(minutes)}`,
          updatedAt: new Date(),
        },
      })
      .returning()) as Array<{ used: bigint | number | null }>;
    const row = upsertRows[0];

    const newUsed = Number(row?.used ?? minutes);
    const previousUsed = newUsed - minutes;

    // Look up the user's plan + Stripe customer id (single round-trip).
    const [sub] = await drizzle
      .select({
        plan: schema.subscriptions.plan,
        stripeCustomerId: schema.subscriptions.stripeCustomerId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);

    const planId = sub?.plan ?? null;
    const plan = planById(planId ?? "personal");
    if (!plan) return;

    // All tiers bill live PSTN minutes — no included-minute pools (capacity is the subscription).
    const isPayAsYouGo = isBalanceFundedVoicePlan(planId);
    const included = 0;
    const newOverageMinutes = Math.max(0, newUsed - Math.max(included, previousUsed));
    if (newOverageMinutes <= 0) return;

    const overageCostUsd = newOverageMinutes * (plan.overage_per_min_usd ?? 0);
    if (overageCostUsd > 0) {
      if (isPayAsYouGo) {
        // Personal path: every minute bills from Conversation Balance (partial debits allowed).
        const debited = await debitForVoiceUsage(userId, overageCostUsd, vapiCallId).catch(() => 0);
        if (debited > 0) return;
        log.warn("pay-as-you-go voice minutes not debited — zero balance", {
          userId,
          minutes: newOverageMinutes,
          costUsd: overageCostUsd,
        });
        return;
      }

      // Subscribed tenants: prepaid credits absorb overage before Stripe metering.
      const covered = await debitForOverage(userId, overageCostUsd, vapiCallId).catch(() => 0);
      if (covered > 0) return;
    }

    if (sub?.stripeCustomerId && !isPayAsYouGo) {
      await emitVoiceMinuteOverageEvent({
        customerId: sub.stripeCustomerId,
        minutes: newOverageMinutes,
        vapiCallId,
      }).catch((e) =>
        log.warn("Stripe overage emission failed", {
          userId,
          minutes: newOverageMinutes,
          error: e?.message,
        }),
      );
    }
  } catch (error: any) {
    log.error("trackVoiceMinutes failed", { userId, error: error?.message });
  }
}

/** Read-only snapshot for the /api/billing/usage endpoint. */
export async function getVoiceUsageSnapshot(userId: string): Promise<VoiceUsageSnapshot> {
  const periodKey = monthlyPeriodKey();

  const [[usageRow], [sub]] = await Promise.all([
    drizzle
      .select({ used: schema.quotaUsage.used })
      .from(schema.quotaUsage)
      .where(
        and(
          eq(schema.quotaUsage.userId, userId),
          eq(schema.quotaUsage.dimension, DIMENSION),
          eq(schema.quotaUsage.periodKey, periodKey),
        ),
      )
      .limit(1),
    drizzle
      .select({ plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1),
  ]);

  const used = Number(usageRow?.used ?? 0);
  const planId = sub?.plan ?? null;
  const plan = planById(planId ?? "personal");
  const included = 0;
  const overage = used;
  const overageRate = plan?.overage_per_min_usd ?? 0.18;

  return {
    plan_id: plan?.id ?? null,
    voice_minutes_used: used,
    voice_minutes_included: included,
    voice_minutes_remaining: Math.max(0, included - used),
    overage_minutes: overage,
    overage_per_min_usd: overageRate,
    overage_cost_usd: Math.round(overage * overageRate * 100) / 100,
    period_key: periodKey,
    reset_at: nextMonthlyResetIso(),
    stripe_metered: !!process.env.STRIPE_VOICE_OVERAGE_METER_EVENT_NAME,
  };
}
