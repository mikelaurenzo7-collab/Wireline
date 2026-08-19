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
  estimateCost,
  runInAuditContext,
  type RuntimeCallMeta,
} from "./ai-audit";
import { DefiniteProviderRejectionError, RuntimeUnavailableError } from "./ai-client";
import { WebsiteFetchError } from "./safe-public-text-fetch";
import { drizzle, log, quotaTracker } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { clearBudgetCache, evaluateSpend, recordDailySpend } from "./spend-guards";

export const WEBSITE_KNOWLEDGE_IMPORT_RESERVE_USD = 0.25;

type SpendDependencies = {
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
    hostname: string;
    minimumCostUsd: number;
  }) => Promise<void>;
};

const productionDependencies: SpendDependencies = {
  preflightTokens: getAiTokenQuotaExceeded,
  reserve: reservePlatformCostRecord,
  release: releasePlatformCostReservation,
  commit: commitPlatformCostReservation,
  settleKnown: settleKnownWebsiteKnowledgeSpend,
};

function actualCostUsd(records: RuntimeCallMeta[]): number {
  return records.reduce(
    (sum, record) =>
      sum +
      estimateCost(
        {
          input_tokens: record.input_tokens,
          output_tokens: record.output_tokens,
          cache_read_input_tokens: record.cache_read_tokens,
          cache_creation_input_tokens: record.cache_create_tokens,
        },
        record.model,
      ),
    0,
  );
}

export function websiteKnowledgeSettledCostUsd(
  records: RuntimeCallMeta[],
  minimumCostUsd = 0,
): number {
  return Math.max(actualCostUsd(records), Math.max(0, minimumCostUsd));
}

async function settleKnownWebsiteKnowledgeSpend(input: {
  reservation: PlatformCostReservation;
  records: RuntimeCallMeta[];
  hostname: string;
  minimumCostUsd: number;
}): Promise<void> {
  const costUsd = websiteKnowledgeSettledCostUsd(input.records, input.minimumCostUsd);
  if (!(costUsd > 0)) {
    await commitPlatformCostReservation(input.reservation);
    return;
  }

  const providers = [...new Set(input.records.map((record) => record.provider))];
  const models = [...new Set(input.records.map((record) => record.model))];
  const tokenDelta = input.records.reduce(
    (sum, record) => sum + record.input_tokens + record.output_tokens,
    0,
  );
  const aggregate = input.records.reduce(
    (sum, record) => ({
      inputTokens: sum.inputTokens + record.input_tokens,
      outputTokens: sum.outputTokens + record.output_tokens,
      cacheReadTokens: sum.cacheReadTokens + record.cache_read_tokens,
      cacheCreateTokens: sum.cacheCreateTokens + record.cache_create_tokens,
      latencyMs: sum.latencyMs + record.latency_ms,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      latencyMs: 0,
    },
  );

  const [updated] = await drizzle
    .update(schema.auditLog)
    .set({
      action: "website-knowledge.import",
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
        hostname: input.hostname,
      },
    })
    .where(
      and(
        eq(schema.auditLog.id, input.reservation.auditId),
        eq(schema.auditLog.userId, input.reservation.userId),
      ),
    )
    .returning({ id: schema.auditLog.id });
  if (!updated) throw new Error("Website import spend reservation disappeared before settlement.");

  clearBudgetCache(input.reservation.userId);
  if (tokenDelta > 0) {
    try {
      const decision = await quotaTracker.checkAndIncrement(
        input.reservation.userId,
        "claude_tokens_daily",
        tokenDelta,
      );
      if (!decision.allowed) {
        log.warn("Website import crossed the daily AI token quota", {
          userId: input.reservation.userId,
          limit: decision.limit,
          used: decision.used,
        });
      }
    } catch (error) {
      log.warn("Website import token accounting failed after provider work", {
        userId: input.reservation.userId,
        error: getErrorMessage(error),
      });
    }
  }
  recordDailySpend(costUsd);
  await evaluateSpend(input.reservation.userId, costUsd);
}

function reservationError(decision: Exclude<PlatformCostReservationDecision, { reserved: true }>) {
  if (decision.reason === "cap_reached") {
    return new AppError(
      402,
      "SPEND_CAP_REACHED",
      "This website import could exceed your remaining managed AI allowance. Review Billing or wait for the next monthly reset.",
      {
        period: decision.period,
        month_to_date_usd: decision.monthToDateUsd,
        monthly_limit_usd: decision.monthlyLimitUsd,
        required_reserve_usd: WEBSITE_KNOWLEDGE_IMPORT_RESERVE_USD,
        recovery_path: "/settings/billing",
      },
    );
  }
  return new AppError(
    503,
    "SPEND_GUARD_UNAVAILABLE",
    "BotBound could not reserve this import against your managed AI allowance. Try again shortly.",
  );
}

export async function runWithWebsiteKnowledgeSpend<T>(
  input: {
    userId: string;
    hostname: string;
    operation: () => Promise<T>;
  },
  dependencies: SpendDependencies = productionDependencies,
): Promise<T> {
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
    action: "website-knowledge.import",
    provider: "managed_structured_runtime",
    model: "bounded_website_extraction",
    costUsd: WEBSITE_KNOWLEDGE_IMPORT_RESERVE_USD,
    requestMeta: {
      accounting_state: "reserved_before_provider",
      hostname: input.hostname,
    },
  });
  if (!decision.reserved) throw reservationError(decision);

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
        minimumCostUsd: auditContext.ambiguousProviderAttempts > 0 ? reservation.costUsd : 0,
      });
    } catch (error) {
      log.error("Website import actual-cost settlement failed; retaining reserve", {
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
      log.error("Website import pre-provider reservation release failed", {
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
