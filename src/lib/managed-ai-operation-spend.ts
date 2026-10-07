import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  commitPlatformCostReservation,
  getAiTokenQuotaExceeded,
  releasePlatformCostReservation,
  reservePlatformCostRecord,
  type PlatformCostReservation,
  type PlatformCostReservationDecision,
} from "../middleware/audit-middleware";
import { AppError } from "./api-error";
import {
  createAuditContext,
  resolveRuntimeCallCost,
  runInAuditContext,
  type RuntimeCallMeta,
} from "./ai-audit";
import { DefiniteProviderRejectionError, RuntimeUnavailableError } from "./ai-client";
import { WebsiteFetchError } from "./safe-public-text-fetch";
import { drizzle, log, quotaTracker } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { clearBudgetCache, evaluateSpend, recordDailySpend } from "./spend-guards";
import { normalizeUsageTokenCount, saturatingUsageTokenSum } from "./ai-usage";

export type ManagedAiSpendDependencies = {
  preflightTokens: (userId: string) => Promise<{ limit: number; used: number } | null>;
  reserve: (input: {
    userId: string;
    action: string;
    provider: string;
    model: string;
    costUsd: number;
    requestMeta?: Record<string, unknown>;
  }) => Promise<PlatformCostReservationDecision>;
  release: (reservation: PlatformCostReservation) => Promise<void>;
  commit: (reservation: PlatformCostReservation) => Promise<void>;
  settleKnown: (input: {
    reservation: PlatformCostReservation;
    records: RuntimeCallMeta[];
    hostname?: string;
    action?: string;
    requestMeta?: Record<string, unknown>;
    minimumCostUsd: number;
    cacheReadQuotaWeight?: number;
  }) => Promise<void>;
};

const productionDependencies: ManagedAiSpendDependencies = {
  preflightTokens: getAiTokenQuotaExceeded,
  reserve: reservePlatformCostRecord,
  release: releasePlatformCostReservation,
  commit: commitPlatformCostReservation,
  settleKnown: settleKnownManagedAiSpend,
};

function actualCostUsd(records: RuntimeCallMeta[]): number {
  return records.reduce((sum, record) => sum + resolveRuntimeCallCost(record).costUsd, 0);
}

export function managedAiSettledCostUsd(records: RuntimeCallMeta[], minimumCostUsd = 0): number {
  return Math.max(actualCostUsd(records), Math.max(0, minimumCostUsd));
}

export function managedAiCostDecision(
  records: RuntimeCallMeta[],
  minimumCostUsd = 0,
): { costUsd: number; costBasis: string; conservativeFloorApplied: boolean } {
  const knownCostUsd = actualCostUsd(records);
  const conservativeFloorUsd = Math.max(0, minimumCostUsd);
  const conservativeFloorApplied = conservativeFloorUsd > knownCostUsd;
  const providerReportedCostCount = records
    .map(resolveRuntimeCallCost)
    .filter((decision) => decision.costBasis === "provider_reported").length;
  const knownCostBasis =
    records.length === 0
      ? "no_known_provider_cost"
      : providerReportedCostCount === records.length
        ? "provider_reported"
        : providerReportedCostCount > 0
          ? "mixed_provider_reported_and_catalog_estimate"
          : "catalog_estimate";

  return {
    costUsd: Math.max(knownCostUsd, conservativeFloorUsd),
    costBasis: conservativeFloorApplied
      ? `${knownCostBasis}_with_conservative_ambiguous_floor`
      : knownCostBasis,
    conservativeFloorApplied,
  };
}

export function aggregateManagedAiUsage(records: RuntimeCallMeta[]): {
  tokenDelta: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  latencyMs: number;
} {
  return records.reduce(
    (sum, record) => ({
      tokenDelta: saturatingUsageTokenSum(
        sum.tokenDelta,
        record.input_tokens,
        record.output_tokens,
        record.cache_read_tokens,
        record.cache_create_tokens,
      ),
      inputTokens: saturatingUsageTokenSum(sum.inputTokens, record.input_tokens),
      outputTokens: saturatingUsageTokenSum(sum.outputTokens, record.output_tokens),
      cacheReadTokens: saturatingUsageTokenSum(sum.cacheReadTokens, record.cache_read_tokens),
      cacheCreateTokens: saturatingUsageTokenSum(sum.cacheCreateTokens, record.cache_create_tokens),
      latencyMs: saturatingUsageTokenSum(
        sum.latencyMs,
        normalizeUsageTokenCount(record.latency_ms),
      ),
    }),
    {
      tokenDelta: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      latencyMs: 0,
    },
  );
}

/**
 * Tokens charged to the daily AI token quota. Cache reads count in full by
 * default; an operation that replays a long cached context every turn (the
 * cloud computer) may weight them by their price ratio instead, so a
 * multi-turn task is measured by what it costs rather than by replay volume.
 */
export function quotaTokenDelta(
  aggregate: ReturnType<typeof aggregateManagedAiUsage>,
  cacheReadQuotaWeight = 1,
): number {
  if (cacheReadQuotaWeight >= 1) return aggregate.tokenDelta;
  const weight = Math.max(0, cacheReadQuotaWeight);
  return saturatingUsageTokenSum(
    aggregate.inputTokens,
    aggregate.outputTokens,
    aggregate.cacheCreateTokens,
    Math.ceil(aggregate.cacheReadTokens * weight),
  );
}

async function settleKnownManagedAiSpend(input: {
  reservation: PlatformCostReservation;
  records: RuntimeCallMeta[];
  hostname?: string;
  action?: string;
  requestMeta?: Record<string, unknown>;
  minimumCostUsd: number;
  cacheReadQuotaWeight?: number;
}): Promise<void> {
  const costDecision = managedAiCostDecision(input.records, input.minimumCostUsd);
  const { costUsd } = costDecision;

  const providers = [...new Set(input.records.map((record) => record.provider))];
  const models = [...new Set(input.records.map((record) => record.model))];
  const aggregate = aggregateManagedAiUsage(input.records);
  const tokenDelta = quotaTokenDelta(aggregate, input.cacheReadQuotaWeight);

  const [updated] = await drizzle
    .update(schema.auditLog)
    .set({
      action: input.action || "website-knowledge.import",
      provider: providers.length === 1 ? providers[0] : "multi",
      model: models.length === 1 ? models[0] : models.join(",").slice(0, 255),
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      cacheReadTokens: aggregate.cacheReadTokens,
      cacheCreateTokens: aggregate.cacheCreateTokens,
      costUsd: String(costUsd),
      latencyMs: aggregate.latencyMs,
      metadata: {
        accounting_state:
          input.minimumCostUsd > 0 ? "settled_with_ambiguous_floor" : "settled_actual",
        reserved_usd: input.reservation.costUsd,
        ambiguous_provider_attempt_floor_usd: input.minimumCostUsd,
        cost_basis: costDecision.costBasis,
        conservative_ambiguous_floor_applied: costDecision.conservativeFloorApplied,
        ...input.requestMeta,
        ...(input.hostname ? { hostname: input.hostname } : {}),
      },
    })
    .where(
      and(
        eq(schema.auditLog.id, input.reservation.auditId),
        eq(schema.auditLog.userId, input.reservation.userId),
      ),
    )
    .returning({ id: schema.auditLog.id });
  if (!updated)
    throw new Error("Managed AI operation spend reservation disappeared before settlement.");

  clearBudgetCache(input.reservation.userId);
  if (tokenDelta > 0) {
    try {
      const decision = await quotaTracker.checkAndIncrement(
        input.reservation.userId,
        "claude_tokens_daily",
        tokenDelta,
      );
      if (!decision.allowed) {
        log.warn("Managed AI operation crossed the daily AI token quota", {
          userId: input.reservation.userId,
          limit: decision.limit,
          used: decision.used,
        });
      }
    } catch (error) {
      log.warn("Managed AI operation token accounting failed after provider work", {
        userId: input.reservation.userId,
        error: getErrorMessage(error),
      });
    }
  }
  recordDailySpend(costUsd);
  await evaluateSpend(input.reservation.userId, costUsd);
}

function reservationError(
  decision: Exclude<PlatformCostReservationDecision, { reserved: true }>,
  reserveUsd: number,
) {
  if (decision.reason === "cap_reached") {
    return new AppError(
      402,
      "SPEND_CAP_REACHED",
      "This operation could exceed your remaining managed AI allowance. Review Billing or wait for the next monthly reset.",
      {
        period: decision.period,
        month_to_date_usd: decision.monthToDateUsd,
        monthly_limit_usd: decision.monthlyLimitUsd,
        required_reserve_usd: reserveUsd,
        recovery_path: "/settings/billing",
      },
    );
  }
  return new AppError(
    503,
    "SPEND_GUARD_UNAVAILABLE",
    "BotBound could not reserve this operation against your managed AI allowance. Try again shortly.",
  );
}

export async function runWithManagedAiSpend<T>(
  input: {
    userId: string;
    hostname?: string;
    action?: string;
    requestMeta?: Record<string, unknown>;
    reserveUsd: number;
    model?: string;
    /** See quotaTokenDelta. Defaults to 1 (cache reads count in full). */
    cacheReadQuotaWeight?: number;
    operation: () => Promise<T>;
  },
  dependencies: ManagedAiSpendDependencies = productionDependencies,
): Promise<T> {
  if (!Number.isFinite(input.reserveUsd) || input.reserveUsd <= 0) {
    throw new AppError(
      503,
      "SPEND_GUARD_UNAVAILABLE",
      "BotBound could not reserve this operation against your managed AI allowance. Try again shortly.",
    );
  }
  const exceeded = await dependencies.preflightTokens(input.userId);
  if (exceeded) {
    throw new AppError(
      429,
      "AI_TOKEN_QUOTA_EXCEEDED",
      "You've reached today's AI usage limit for your plan. It resets at midnight UTC, scheduled calls and texts are unaffected.",
      {
        limit: exceeded.limit,
        used: exceeded.used,
        recovery_path: "/settings/billing",
      },
    );
  }

  const decision = await dependencies.reserve({
    userId: input.userId,
    action: input.action || "website-knowledge.import",
    provider: "managed_structured_runtime",
    model: input.model || "bounded_managed_operation",
    costUsd: input.reserveUsd,
    requestMeta: {
      accounting_state: "reserved_before_provider",
      ...input.requestMeta,
      ...(input.hostname ? { hostname: input.hostname } : {}),
    },
  });
  if (!decision.reserved) throw reservationError(decision, input.reserveUsd);

  const reservation = decision.reservation;
  const auditContext = createAuditContext();
  let result: T | undefined;
  let operationFailed = false;
  let operationError: unknown;
  try {
    result = await runInAuditContext(auditContext, input.operation);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  if (auditContext.records.length > 0) {
    try {
      await dependencies.settleKnown({
        reservation,
        records: auditContext.records,
        hostname: input.hostname,
        action: input.action,
        requestMeta: input.requestMeta,
        minimumCostUsd: auditContext.ambiguousProviderAttempts > 0 ? reservation.costUsd : 0,
        cacheReadQuotaWeight: input.cacheReadQuotaWeight,
      });
    } catch (error) {
      log.error("Managed AI operation actual-cost settlement failed; retaining reserve", {
        userId: input.userId,
        hostname: input.hostname,
        error: getErrorMessage(error),
      });
      await dependencies.commit(reservation);
    }
  } else if (
    auditContext.ambiguousProviderAttempts === 0 &&
    (operationError instanceof WebsiteFetchError ||
      operationError instanceof RuntimeUnavailableError ||
      operationError instanceof DefiniteProviderRejectionError)
  ) {
    try {
      await dependencies.release(reservation);
    } catch (error) {
      log.error("Managed AI operation pre-provider reservation release failed", {
        userId: input.userId,
        hostname: input.hostname,
        error: getErrorMessage(error),
      });
    }
  } else {
    await dependencies.commit(reservation);
  }

  if (operationFailed) throw operationError;
  return result as T;
}
