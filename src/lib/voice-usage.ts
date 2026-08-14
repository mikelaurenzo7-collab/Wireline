/* eslint-disable @typescript-eslint/no-explicit-any -- database payloads are vendor-defined. */
/**
 * Monthly live-voice accounting for founder early access.
 *
 * Commercial rules:
 * - Every completed live-call attempt consumes at least one minute, including
 *   rejected, busy, voicemail, and zero-second outbound attempts.
 * - Paid plans consume their monthly included pool first.
 * - Paid extra-agent add-ons increase both agent capacity and included minutes.
 * - Usage beyond the included pool is finalized against Runtime Balance.
 * - A live call is never terminated for billing. If the call exceeds available
 *   prepaid coverage, completion grace records the amount due and the next live
 *   action is blocked until the balance is restored.
 * - No Stripe meter event is emitted and no automatic overage invoice is created.
 * - A provider call contributes to the monthly counter exactly once, while an
 *   unfinished Runtime Balance debit can be resumed safely on webhook retry.
 */

import { and, eq, sql } from "drizzle-orm";
import { voiceUsageEvents } from "../db/voice-usage-schema";
import { chargeCompletedVoiceUsage } from "./voice-completion-grace";
import { FLAT_OVERAGE_PER_MIN_USD, planById } from "./plan-catalog";
import { drizzle, log } from "./server-context";
import { dailyPeriodKey } from "./tenant-quotas";
import * as schema from "../db/schema";

const DIMENSION = "voice_minutes_monthly";

export function monthlyPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

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

interface PreparedVoiceUsage {
  newlyCounted: boolean;
  minutes: number;
  incrementalOverageMinutes: number;
  overageCostUsd: number;
  overageRateUsd: number;
  planId: string | null;
  chargedAt: Date | null;
}

/** Count one minimum billable minute per completed provider attempt. */
export function billableVoiceMinutes(durationSeconds: number): number {
  const safeSeconds = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  return Math.max(1, Math.ceil(safeSeconds / 60));
}

export function includedVoiceMinutes(
  planId: string | null | undefined,
  extraAgents: number | null | undefined,
): {
  plan: ReturnType<typeof planById>;
  included: number;
} {
  const plan = planById(planId ?? "personal");
  const safeExtraAgents = Math.max(0, Number(extraAgents ?? 0));
  const baseIncluded = Math.max(0, plan?.voice_minutes_monthly ?? 0);
  const extraIncluded = safeExtraAgents * Math.max(0, plan?.extra_agent_voice_minutes_monthly ?? 0);
  return { plan, included: baseIncluded + extraIncluded };
}

/**
 * Claim and count one provider call in a single transaction.
 *
 * The per-call row is inserted before the aggregate increment. PostgreSQL's
 * composite primary key serializes concurrent deliveries for the same provider
 * call: exactly one transaction receives `inserted`, and only that transaction
 * increments `wireline_quota_usage`. The event row and aggregate commit or roll
 * back together, so a retry never observes a claim without its corresponding
 * monthly and daily minutes.
 */
async function prepareVoiceUsage(opts: {
  userId: string;
  providerCallId: string;
  minutes: number;
  periodKey: string;
  dailyKey: string;
}): Promise<PreparedVoiceUsage> {
  const { userId, providerCallId, minutes, periodKey, dailyKey } = opts;

  return drizzle.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(voiceUsageEvents)
      .values({
        userId,
        providerCallId,
        periodKey,
        billableMinutes: minutes,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [voiceUsageEvents.userId, voiceUsageEvents.providerCallId],
      })
      .returning({ providerCallId: voiceUsageEvents.providerCallId });

    if (!inserted) {
      const [existing] = await tx
        .select({
          billableMinutes: voiceUsageEvents.billableMinutes,
          incrementalOverageMinutes: voiceUsageEvents.incrementalOverageMinutes,
          overageCostUsd: voiceUsageEvents.overageCostUsd,
          chargedAt: voiceUsageEvents.chargedAt,
        })
        .from(voiceUsageEvents)
        .where(
          and(
            eq(voiceUsageEvents.userId, userId),
            eq(voiceUsageEvents.providerCallId, providerCallId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new Error("Voice usage event claim exists but could not be re-read");
      }

      const [billing] = await tx
        .select({
          plan: schema.subscriptions.plan,
          extraAgents: schema.settings.extraAgents,
        })
        .from(schema.settings)
        .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
        .where(eq(schema.settings.userId, userId))
        .limit(1);
      const { plan } = includedVoiceMinutes(billing?.plan ?? null, billing?.extraAgents);

      return {
        newlyCounted: false,
        minutes: Number(existing.billableMinutes || minutes),
        incrementalOverageMinutes: Number(existing.incrementalOverageMinutes || 0),
        overageCostUsd: Number(existing.overageCostUsd || 0),
        overageRateUsd: plan?.overage_per_min_usd ?? FLAT_OVERAGE_PER_MIN_USD,
        planId: plan?.id ?? null,
        chargedAt: existing.chargedAt ?? null,
      };
    }

    const upsertRows = (await tx
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

    // Keep the daily burst counter in the same transaction as the per-call
    // idempotency claim and monthly aggregate. If this transaction commits,
    // both quota windows contain the call; if it rolls back, a provider retry
    // can safely settle all three records together.
    await tx
      .insert(schema.quotaUsage)
      .values({
        userId,
        dimension: "voice_minutes_daily",
        periodKey: dailyKey,
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
      });

    const newUsed = Number(upsertRows[0]?.used ?? minutes);
    const previousUsed = Math.max(0, newUsed - minutes);

    const [billing] = await tx
      .select({
        plan: schema.subscriptions.plan,
        extraAgents: schema.settings.extraAgents,
      })
      .from(schema.settings)
      .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
      .where(eq(schema.settings.userId, userId))
      .limit(1);

    const planId = billing?.plan ?? null;
    const { plan, included } = includedVoiceMinutes(planId, billing?.extraAgents);
    const previousOverage = Math.max(0, previousUsed - included);
    const newOverageTotal = Math.max(0, newUsed - included);
    const incrementalOverageMinutes = Math.max(0, newOverageTotal - previousOverage);
    const overageRateUsd = plan?.overage_per_min_usd ?? FLAT_OVERAGE_PER_MIN_USD;
    // Fail CLOSED on an unresolvable stored plan id: charging $0 here would
    // hand that tenant unlimited voice minutes on a never-debited wallet while
    // the UI still displays a charge. A catalog rotation that orphans a plan id
    // must surface as an alarm plus the published flat rate, never free COGS.
    if (!plan && planId) {
      log.error("Voice overage metered at flat rate: stored plan id is unresolvable", {
        userId,
        storedPlanId: planId,
      });
    }
    const overageCostUsd = Math.round(incrementalOverageMinutes * overageRateUsd * 100) / 100;

    await tx
      .update(voiceUsageEvents)
      .set({
        incrementalOverageMinutes,
        overageCostUsd: String(overageCostUsd),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(voiceUsageEvents.userId, userId),
          eq(voiceUsageEvents.providerCallId, providerCallId),
        ),
      );

    return {
      newlyCounted: true,
      minutes,
      incrementalOverageMinutes,
      overageCostUsd,
      overageRateUsd,
      planId: plan?.id ?? null,
      chargedAt: null,
    };
  });
}

export async function trackVoiceMinutes(opts: {
  userId: string;
  durationSeconds: number;
  vapiCallId: string;
}): Promise<void> {
  const { userId, durationSeconds, vapiCallId } = opts;
  if (!userId) return;
  // "unknown" is the call-log fallback id, not a provider call id. Metering on
  // it would collapse every id-less call for a tenant onto one checkpoint row
  // and silently skip billing for all but the first. Refuse it like a missing
  // id — but make the revenue skip observable rather than a silent return.
  if (!vapiCallId || vapiCallId === "unknown") {
    log.warn("Voice metering skipped: provider call id missing", {
      userId,
      durationSeconds,
    });
    return;
  }

  const minutes = billableVoiceMinutes(durationSeconds);
  const now = new Date();
  const periodKey = monthlyPeriodKey(now);
  const dailyKey = dailyPeriodKey(now);

  try {
    const prepared = await prepareVoiceUsage({
      userId,
      providerCallId: vapiCallId,
      minutes,
      periodKey,
      dailyKey,
    });

    if (prepared.incrementalOverageMinutes <= 0 || prepared.overageCostUsd <= 0) return;
    if (prepared.chargedAt) return;

    // The ledger debit is itself idempotent on voice_completion:<providerCallId>.
    // If this succeeds but the charged_at checkpoint update fails, a retry may
    // call it again safely; reverseCredit returns the already-applied ledger
    // entry rather than debiting twice.
    const charge = await chargeCompletedVoiceUsage({
      userId,
      costUsd: prepared.overageCostUsd,
      providerCallId: vapiCallId,
      billableMinutes: prepared.incrementalOverageMinutes,
      rateUsd: prepared.overageRateUsd,
    });

    await drizzle
      .update(voiceUsageEvents)
      .set({ chargedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(voiceUsageEvents.userId, userId), eq(voiceUsageEvents.providerCallId, vapiCallId)),
      );

    if (charge.used_completion_grace) {
      log.warn("Completed call used voice completion grace", {
        userId,
        planId: prepared.planId,
        callId: vapiCallId,
        billableMinutes: prepared.minutes,
        incrementalOverageMinutes: prepared.incrementalOverageMinutes,
        chargedUsd: prepared.overageCostUsd,
        balanceUsd: charge.balance_usd,
        completionGraceDueUsd: charge.completion_grace_due_usd,
        policy: "finish_current_block_next",
      });
    }
  } catch (error: any) {
    log.error("trackVoiceMinutes failed — provider retry required", {
      userId,
      callId: vapiCallId,
      error: error?.message,
    });
    // Do not swallow revenue-integrity failures. The Vapi end-of-call handler
    // is retryable and this function is now idempotent per provider call, so a
    // failed count/debit must escape and be resumed by redelivery.
    throw error;
  }
}

export async function getVoiceUsageSnapshot(userId: string): Promise<VoiceUsageSnapshot> {
  const periodKey = monthlyPeriodKey();

  const [[usageRow], [billing]] = await Promise.all([
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
      .select({
        plan: schema.subscriptions.plan,
        extraAgents: schema.settings.extraAgents,
      })
      .from(schema.settings)
      .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
      .where(eq(schema.settings.userId, userId))
      .limit(1),
  ]);

  const used = Number(usageRow?.used ?? 0);
  const planId = billing?.plan ?? null;
  const { plan, included } = includedVoiceMinutes(planId, billing?.extraAgents);
  const overage = Math.max(0, used - included);
  const overageRate = plan?.overage_per_min_usd ?? FLAT_OVERAGE_PER_MIN_USD;

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
    stripe_metered: false,
  };
}
