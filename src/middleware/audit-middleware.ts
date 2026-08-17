/* eslint-disable @typescript-eslint/no-explicit-any */
import { drizzle, log, quotaTracker } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { runInBackground } from "../lib/background-work";
import { getErrorMessage } from "../lib/server-utils";
import {
  createAuditContext,
  estimateCost,
  runInAuditContext,
  type RuntimeCallMeta,
} from "../lib/ai-audit";
import { clearBudgetCache, recordDailySpend, evaluateSpend } from "../lib/spend-guards";

function estimateAuditRecordCost(record: RuntimeCallMeta): number {
  // estimateCost normalizes gateway-prefixed ids ("xai/grok-4.5") to their bare
  // model for pricing, so every provider shares one price table.
  return estimateCost(
    {
      input_tokens: record.input_tokens,
      output_tokens: record.output_tokens,
      cache_read_input_tokens: record.cache_read_tokens,
      cache_creation_input_tokens: record.cache_create_tokens,
    },
    record.model,
  );
}

export async function persistRuntimeAuditRecords(opts: {
  userId: string;
  action: string;
  records: RuntimeCallMeta[];
  requestMeta?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.records.length) return;
  const rows = opts.records.map((record) => ({
    userId: opts.userId,
    action: opts.action,
    provider: record.provider,
    model: record.model,
    inputTokens: record.input_tokens,
    outputTokens: record.output_tokens,
    cacheReadTokens: record.cache_read_tokens,
    cacheCreateTokens: record.cache_create_tokens,
    costUsd: String(estimateAuditRecordCost(record)),
    latencyMs: record.latency_ms,
    metadata: { ...(opts.requestMeta || {}) },
  }));
  const deltaUsd = rows.reduce((sum: number, row: any) => sum + Number(row.costUsd || 0), 0);
  try {
    await drizzle.insert(schema.auditLog).values(rows);
  } catch (error) {
    log.error("Runtime audit insert failed", { error: getErrorMessage(error) });
    return;
  }
  const tokenDelta = opts.records.reduce(
    (sum, record) => sum + record.input_tokens + record.output_tokens,
    0,
  );
  if (tokenDelta > 0) {
    try {
      const decision = await quotaTracker.checkAndIncrement(
        opts.userId,
        "claude_tokens_daily",
        tokenDelta,
      );
      if (!decision.allowed)
        log.warn("AI token quota exceeded after call", {
          user_id: opts.userId,
          limit: decision.limit,
          used: decision.used,
        });
    } catch (error) {
      log.warn("AI token quota increment failed", {
        user_id: opts.userId,
        error: getErrorMessage(error),
      });
    }
  }
  recordDailySpend(deltaUsd);
  await evaluateSpend(opts.userId, deltaUsd).catch((error: unknown) =>
    log.error("Runtime spend evaluation failed", { error: getErrorMessage(error) }),
  );
}

/**
 * Flat-reserve cost record for platform work that is not token-priced.
 *
 * Perplexity search/research is dominated by a per-request fee and Apollo
 * enrichment by per-credit pricing, so the token pipeline above cannot price
 * them — and until now nothing did: both ran as invisible COGS outside the
 * account AI-spend envelope the docstring in plan-entitlements claims funds
 * them. This writes the same wireline_audit_log row the token pipeline
 * writes (explicit costUsd, zero tokens), so the spend budget, AISpendView,
 * and spend alerts finally see one complete envelope.
 *
 * The per-unit values are conservative operational reserves, env-tunable to
 * the account's actual vendor contract — deliberately not presented as vendor
 * price truth.
 */
const PLATFORM_COST_RESERVES = {
  perplexity_request: { env: "WIRELINE_PERPLEXITY_REQUEST_RESERVE_USD", fallback: 0.01 },
  apollo_enrichment: { env: "WIRELINE_APOLLO_ENRICHMENT_RESERVE_USD", fallback: 0.05 },
  /**
   * One minted realtime voice session. Browser-to-vendor WebRTC audio never
   * flows through the token audit path (ai-models.ts documents this), so the
   * mint is the only place the platform can meter it. Reserve basis: the same
   * 5 charged minutes simulationMinuteQuota debits per mint, at a conservative
   * blended GA realtime audio rate.
   */
  openai_realtime_session: { env: "WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD", fallback: 0.3 },
} as const;

export function platformCostReserveUsd(kind: keyof typeof PLATFORM_COST_RESERVES): number {
  const reserve = PLATFORM_COST_RESERVES[kind];
  const parsed = Number.parseFloat(process.env[reserve.env] || "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : reserve.fallback;
}

export async function persistPlatformCostRecord(opts: {
  userId: string;
  action: string;
  provider: string;
  model: string;
  costUsd: number;
  latencyMs?: number;
  requestMeta?: Record<string, unknown>;
}): Promise<void> {
  if (!(opts.costUsd > 0)) return;
  try {
    await drizzle.insert(schema.auditLog).values({
      userId: opts.userId,
      action: opts.action,
      provider: opts.provider,
      model: opts.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      costUsd: String(opts.costUsd),
      latencyMs: opts.latencyMs ?? 0,
      metadata: { ...(opts.requestMeta || {}) },
    });
  } catch (error) {
    log.error("Platform cost record insert failed", {
      action: opts.action,
      error: getErrorMessage(error),
    });
    return;
  }
  recordDailySpend(opts.costUsd);
  await evaluateSpend(opts.userId, opts.costUsd).catch((error: unknown) =>
    log.error("Platform cost spend evaluation failed", { error: getErrorMessage(error) }),
  );
}

export type PlatformCostReservation = {
  auditId: bigint;
  userId: string;
  costUsd: number;
};

export type PlatformCostReservationDecision =
  | { reserved: true; reservation: PlatformCostReservation }
  | {
      reserved: false;
      reason: "cap_reached" | "unavailable";
      period?: string;
      monthToDateUsd?: number;
      monthlyLimitUsd?: number;
    };

/**
 * Atomically serialize fixed-cost platform reservations on the tenant budget
 * row, verify fresh month-to-date spend, and write the audit debit before a
 * browser receives a provider-funded realtime session.
 */
export async function reservePlatformCostRecord(opts: {
  userId: string;
  action: string;
  provider: string;
  model: string;
  costUsd: number;
  requestMeta?: Record<string, unknown>;
}): Promise<PlatformCostReservationDecision> {
  if (!(opts.costUsd > 0)) return { reserved: false, reason: "unavailable" };
  const period = new Date().toISOString().slice(0, 7);
  const periodStart = new Date(`${period}-01T00:00:00.000Z`);

  try {
    const decision = await drizzle.transaction(async (tx) => {
      const [budget] = await tx
        .select({
          monthlyLimitUsd: schema.spendBudgets.monthlyLimitUsd,
          hardCap: schema.spendBudgets.hardCap,
          enabled: schema.spendBudgets.enabled,
        })
        .from(schema.spendBudgets)
        .where(eq(schema.spendBudgets.userId, opts.userId))
        .limit(1)
        .for("update");

      if (!budget) {
        return { reserved: false, reason: "unavailable" } as const;
      }

      const monthlyLimitUsd = Number(budget.monthlyLimitUsd || 0);
      const hardCapEnabled = budget.enabled !== false && budget.hardCap === true;
      if (hardCapEnabled && !(monthlyLimitUsd > 0)) {
        return { reserved: false, reason: "unavailable" } as const;
      }

      const [mtd] = await tx
        .select({
          costUsd: sql<string>`coalesce(sum(${schema.auditLog.costUsd}), 0)`.mapWith(String),
        })
        .from(schema.auditLog)
        .where(
          and(eq(schema.auditLog.userId, opts.userId), gte(schema.auditLog.createdAt, periodStart)),
        );
      const monthToDateUsd = Number(mtd?.costUsd || 0);
      if (hardCapEnabled && monthToDateUsd + opts.costUsd > monthlyLimitUsd) {
        return {
          reserved: false,
          reason: "cap_reached",
          period,
          monthToDateUsd,
          monthlyLimitUsd,
        } as const;
      }

      const [row] = await tx
        .insert(schema.auditLog)
        .values({
          userId: opts.userId,
          action: opts.action,
          provider: opts.provider,
          model: opts.model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreateTokens: 0,
          costUsd: String(opts.costUsd),
          latencyMs: 0,
          metadata: { ...(opts.requestMeta || {}), accounting_state: "reserved_before_provider" },
        })
        .returning({ id: schema.auditLog.id });
      if (!row) throw new Error("Platform cost reservation insert returned no row.");

      return {
        reserved: true,
        reservation: { auditId: row.id, userId: opts.userId, costUsd: opts.costUsd },
      } as const;
    });
    clearBudgetCache(opts.userId);
    return decision;
  } catch (error) {
    log.error("Platform cost reservation failed closed", {
      userId: opts.userId,
      action: opts.action,
      error: getErrorMessage(error),
    });
    return { reserved: false, reason: "unavailable" };
  }
}

/** Remove a pre-provider reservation after a definitive no-session outcome. */
export async function releasePlatformCostReservation(
  reservation: PlatformCostReservation,
): Promise<void> {
  await drizzle
    .delete(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.id, reservation.auditId),
        eq(schema.auditLog.userId, reservation.userId),
      ),
    );
  clearBudgetCache(reservation.userId);
}

/** Publish telemetry after the already-durable reservation becomes real spend. */
export async function commitPlatformCostReservation(
  reservation: PlatformCostReservation,
): Promise<void> {
  recordDailySpend(reservation.costUsd);
  await evaluateSpend(reservation.userId, reservation.costUsd).catch((error: unknown) =>
    log.error("Reserved platform cost spend evaluation failed", {
      userId: reservation.userId,
      error: getErrorMessage(error),
    }),
  );
}

/**
 * Daily AI-token ceiling, evaluated BEFORE the model call.
 *
 * `claude_tokens_daily` is described in tenant-quotas.ts as a hard cap and is
 * sized per plan (200k/day on free, 20M on enterprise), but the only code that
 * ever consulted it was `persistRuntimeAuditRecords` below — which runs after
 * the provider has already billed, and whose `!allowed` branch writes nothing
 * but a log line. The dimension counted spend without ever bounding it: a free
 * tenant could run the 200k/day allowance a hundred times over and the only
 * trace would be warnings in the server log. The other two vendor-metered
 * dimensions (`voice_minutes_daily`, `simulation_minutes_daily`) each gate
 * their route before the spend happens; this closes the same gap for tokens.
 *
 * Reads usage without incrementing, so `persistRuntimeAuditRecords` stays the
 * single writer and the counter keeps tracking real tokens rather than request
 * count. Because the check is a read of the previous total, the request that
 * crosses the line still completes — the ceiling bounds the overshoot to one
 * call, it is not a mid-call kill switch.
 *
 * Fails OPEN on a counter-store error, unlike `simulationMinuteQuota`. A
 * realtime mint is one discrete vendor charge that is trivially deferred; an
 * assistant reply is the product's core interaction, and taking every tenant
 * offline on a quota-table blip is the worse failure. The monthly USD cap in
 * `enforceSpendCap` remains the backstop that does fail closed.
 */
export async function getAiTokenQuotaExceeded(
  userId: string,
): Promise<{ limit: number; used: number } | null> {
  try {
    const [{ profile }, used] = await Promise.all([
      quotaTracker.getProfile(userId, true),
      quotaTracker.getUsage(userId, "claude_tokens_daily"),
    ]);
    const limit = profile.claude_tokens_daily;
    // A 0 override is an operator hard-stop, not "no ceiling". Admission also
    // bypasses the 30s override cache so a newly lowered cap cannot remain
    // stale in one warm serverless invocation.
    return used >= limit ? { limit, used } : null;
  } catch (error) {
    log.error("AI token quota check failed, allowing request", {
      user_id: userId,
      error: getErrorMessage(error),
    });
    return null;
  }
}

/**
 * Marks a route as AI-spending: enforces the daily token ceiling on the way in
 * and persists the resulting spend on the way out. Enforcement lives here
 * rather than as a separate middleware so the two can never drift — a route
 * that meters its spend is a route that respects the ceiling, by construction.
 */
export function withAudit(actionPrefix: string) {
  return async (req: any, res: any, next: any) => {
    const userId = req?.user?.id;
    if (userId) {
      const exceeded = await getAiTokenQuotaExceeded(userId);
      if (exceeded) {
        res.setHeader("Retry-After", "3600");
        return res.status(429).json({
          code: "AI_TOKEN_QUOTA_EXCEEDED",
          error:
            "You've reached today's AI usage limit for your plan. It resets at midnight UTC, scheduled calls and texts are unaffected.",
          limit: exceeded.limit,
          used: exceeded.used,
          recovery_path: "/settings/billing",
        });
      }
    }
    const ctx = createAuditContext();
    res.on("finish", () => {
      // Persist on 5xx too: the provider already billed the model call, so a
      // handler failure after the model returned must still land in the spend
      // ledger or the tenant's budget drifts under exactly the retry loops
      // most likely to burn money.
      if (!ctx.records.length || !req?.user?.id) return;
      const subpath = req.path.replace(/\//g, ".").replace(/^\.+/, "");
      // runInBackground, not a detached promise: on Vercel the instance can
      // freeze as soon as the response flushes, and a suspended audit INSERT
      // is unmetered COGS with no ledger trace.
      runInBackground("ai spend accounting", () =>
        persistRuntimeAuditRecords({
          userId: req.user.id,
          action: actionPrefix ? `${actionPrefix}.${subpath}` : subpath,
          records: ctx.records,
          requestMeta: { method: req.method, path: req.path, status: res.statusCode },
        }),
      );
    });
    runInAuditContext(ctx, () => next());
  };
}
