import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { PlatformCostReservation } from "../middleware/audit-middleware";
import { saturatingUsageTokenSum } from "./ai-usage";
import { providerSpendMeter } from "./provider-spend-meter";
import { drizzle, log } from "./server-context";
import { clearBudgetCache, recordDailySpend } from "./spend-guards";
import {
  parseRealtimeProviderUsage,
  type RealtimeProviderUsage,
} from "./voice/openai-realtime-usage";

const RECEIPT_ACTION = "voice.realtime.usage_receipt";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const amount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Invalid realtime cost receipt.");
  return parsed;
};
const sumUsd = (left: number, right: number) => Math.round((left + right) * 1_000_000) / 1_000_000;

/**
 * Persist trusted SIP usage once per provider response/item, across reconnects.
 * The event receipt has zero ledger cost/tokens: the existing session receipt
 * holds the aggregate, so both billing and reports count it only once.
 * Sideband evidence can be incomplete. Never refund the duration reserve from
 * observed tokens; raise it only when observed vendor cost exceeds that floor.
 * This is provider COGS only and never changes customer voice usage or wallet.
 */
export async function persistRealtimeProviderUsage(
  reservation: PlatformCostReservation,
  callId: string,
  usage: RealtimeProviderUsage,
): Promise<void> {
  if (!Number.isFinite(usage.costUsd) || usage.costUsd < 0 || usage.costUsd > 999_999.999999) {
    throw new Error("Invalid observed realtime cost.");
  }
  const key = createHash("sha256").update(`${reservation.auditId}:${usage.key}`).digest("hex");
  const delta = await drizzle.transaction(async (tx) => {
    // Keep the same lock order as reservation/elapsed accounting.
    await tx
      .select({ userId: schema.spendBudgets.userId })
      .from(schema.spendBudgets)
      .where(eq(schema.spendBudgets.userId, reservation.userId))
      .for("update");
    const [row] = await tx
      .select({
        id: schema.auditLog.id,
        action: schema.auditLog.action,
        provider: schema.auditLog.provider,
        idempotencyKey: schema.auditLog.idempotencyKey,
        costUsd: schema.auditLog.costUsd,
        inputTokens: schema.auditLog.inputTokens,
        outputTokens: schema.auditLog.outputTokens,
        cacheReadTokens: schema.auditLog.cacheReadTokens,
        metadata: schema.auditLog.metadata,
      })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.id, reservation.auditId),
          eq(schema.auditLog.userId, reservation.userId),
        ),
      )
      .limit(1)
      .for("update");
    const metadata = record(row?.metadata);
    if (
      !row ||
      providerSpendMeter(row) !== "live_voice" ||
      row.idempotencyKey !== `openai-sip:${callId}` ||
      !["committed", "provider_outcome_ambiguous", "reserved_before_provider"].includes(
        String(metadata.accounting_state),
      )
    ) {
      throw new Error("Trusted SIP usage does not match its admitted cost receipt.");
    }
    const [inserted] = await tx
      .insert(schema.auditLog)
      .values({
        userId: reservation.userId,
        action: RECEIPT_ACTION,
        provider: "openai",
        model: usage.model,
        costUsd: "0",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        idempotencyKey: key,
        eventType: "voice.provider_usage.observed",
        metadata: {
          session_audit_id: String(reservation.auditId),
          usage_kind: usage.kind,
          provider_usage_key: usage.key,
          catalog_cost_usd: usage.costUsd,
          token_details: usage.details,
        },
      })
      .onConflictDoNothing()
      .returning({ id: schema.auditLog.id });
    if (!inserted) return 0;
    const observed = record(metadata.provider_usage_observed);
    const kindCostKey = usage.kind === "response" ? "response_cost_usd" : "transcription_cost_usd";
    const totalCost = sumUsd(amount(observed.total_cost_usd), usage.costUsd);
    const previous = amount(row.costUsd);
    const next = Math.max(previous, totalCost);
    await tx
      .update(schema.auditLog)
      .set({
        costUsd: String(next),
        inputTokens: saturatingUsageTokenSum(row.inputTokens, usage.inputTokens),
        outputTokens: saturatingUsageTokenSum(row.outputTokens, usage.outputTokens),
        cacheReadTokens: saturatingUsageTokenSum(row.cacheReadTokens, usage.cacheReadTokens),
        metadata: {
          ...metadata,
          accounting_state: "committed",
          cost_basis: "realtime_observed_with_duration_reserve_floor",
          provider_usage_observed: {
            ...observed,
            total_cost_usd: totalCost,
            [kindCostKey]: sumUsd(amount(observed[kindCostKey]), usage.costUsd),
            event_count: saturatingUsageTokenSum(observed.event_count, 1),
            coverage: "partial_sideband",
            pricing_basis: "catalog_token_rates",
          },
        },
      })
      .where(
        and(
          eq(schema.auditLog.id, reservation.auditId),
          eq(schema.auditLog.userId, reservation.userId),
        ),
      );
    // A valid usage event proves generation even if the initial commit-state
    // write failed. Recover that transition once, as elapsed accounting does.
    return metadata.accounting_state === "committed" ? next - previous : next;
  });
  if (delta > 0) {
    clearBudgetCache(reservation.userId);
    recordDailySpend(delta);
  }
}

/** Nonblocking bounded retry buffer; the durable reserve covers missing events. */
export function createRealtimeUsageRecorder(
  reservation: PlatformCostReservation,
  callId: string,
  transcriptionModel: string,
  persist = persistRealtimeProviderUsage,
) {
  const pending = new Map<string, RealtimeProviderUsage>();
  let work: Promise<void> | null = null;
  let dropped = false;
  const drain = async () => {
    for (const [key, usage] of pending) {
      try {
        await persist(reservation, callId, usage);
        pending.delete(key);
      } catch {
        log.warn("SIP provider usage persistence deferred; duration reserve retained", {
          userId: reservation.userId,
          callId,
          pendingEvents: pending.size,
        });
        return;
      }
    }
  };
  return {
    observe(event: Record<string, unknown>) {
      const usage = parseRealtimeProviderUsage(event, transcriptionModel);
      if (!usage) return;
      if (pending.size >= 512 && !pending.has(usage.key)) {
        if (!dropped)
          log.error("SIP provider usage buffer full; duration reserve retained", {
            userId: reservation.userId,
            callId,
          });
        dropped = true;
        return;
      }
      pending.set(usage.key, usage);
      if (!work)
        work = drain().finally(() => {
          work = null;
        });
    },
    async flush() {
      await work;
      if (pending.size) await drain();
      // A process/socket failure or prolonged DB outage can lose unseen or
      // unpersisted events. Do not certify completeness or reduce the reserve.
    },
  };
}
