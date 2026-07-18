/* eslint-disable @typescript-eslint/no-explicit-any -- database payloads are vendor-defined. */
/**
 * Monthly live-voice accounting for founder early access.
 *
 * Commercial rules:
 * - Every completed live-call attempt consumes at least one minute, including
 *   rejected, busy, voicemail, and zero-second outbound attempts.
 * - Paid plans consume their monthly included pool first.
 * - Paid extra-agent add-ons increase both agent capacity and included minutes.
 * - Usage beyond the included pool is finalized against Conversation Balance.
 * - A live call is never terminated for billing. If the call exceeds available
 *   prepaid coverage, completion grace records the amount due and the next live
 *   action is blocked until the balance is restored.
 * - No Stripe meter event is emitted and no automatic overage invoice is created.
 */

import { and, eq, sql } from "drizzle-orm";
import { chargeCompletedVoiceUsage } from "./voice-completion-grace";
import { planById } from "./plan-catalog";
import { drizzle, log } from "./server-context";
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

export async function trackVoiceMinutes(opts: {
  userId: string;
  durationSeconds: number;
  vapiCallId: string;
}): Promise<void> {
  const { userId, durationSeconds, vapiCallId } = opts;
  if (!userId || !vapiCallId) return;

  const minutes = billableVoiceMinutes(durationSeconds);
  const periodKey = monthlyPeriodKey();

  try {
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

    const newUsed = Number(upsertRows[0]?.used ?? minutes);
    const previousUsed = Math.max(0, newUsed - minutes);

    const [billing] = await drizzle
      .select({ plan: schema.subscriptions.plan, extraAgents: schema.settings.extraAgents })
      .from(schema.settings)
      .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
      .where(eq(schema.settings.userId, userId))
      .limit(1);

    const planId = billing?.plan ?? null;
    const { plan, included } = includedVoiceMinutes(planId, billing?.extraAgents);
    if (!plan) return;

    const previousOverage = Math.max(0, previousUsed - included);
    const newOverageTotal = Math.max(0, newUsed - included);
    const incrementalOverageMinutes = Math.max(0, newOverageTotal - previousOverage);
    if (incrementalOverageMinutes <= 0) return;

    const overageCostUsd =
      Math.round(incrementalOverageMinutes * plan.overage_per_min_usd * 100) / 100;
    if (overageCostUsd <= 0) return;

    const charge = await chargeCompletedVoiceUsage({
      userId,
      costUsd: overageCostUsd,
      providerCallId: vapiCallId,
      billableMinutes: incrementalOverageMinutes,
      rateUsd: plan.overage_per_min_usd,
    });

    if (charge.used_completion_grace) {
      log.warn("Completed call used voice completion grace", {
        userId,
        planId: plan.id,
        callId: vapiCallId,
        billableMinutes: minutes,
        incrementalOverageMinutes,
        chargedUsd: overageCostUsd,
        balanceUsd: charge.balance_usd,
        completionGraceDueUsd: charge.completion_grace_due_usd,
        policy: "finish_current_block_next",
      });
    }
  } catch (error: any) {
    log.error("trackVoiceMinutes failed", {
      userId,
      callId: vapiCallId,
      error: error?.message,
    });
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
      .select({ plan: schema.subscriptions.plan, extraAgents: schema.settings.extraAgents })
      .from(schema.settings)
      .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
      .where(eq(schema.settings.userId, userId))
      .limit(1),
  ]);

  const used = Number(usageRow?.used ?? 0);
  const planId = billing?.plan ?? null;
  const { plan, included } = includedVoiceMinutes(planId, billing?.extraAgents);
  const overage = Math.max(0, used - included);
  const overageRate = plan?.overage_per_min_usd ?? 0.2;

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
