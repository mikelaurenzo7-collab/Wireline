/* eslint-disable @typescript-eslint/no-explicit-any */
import { drizzle, log, quotaTracker } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import {
  createAuditContext,
  estimateCost,
  runInAuditContext,
  type RuntimeCallMeta,
} from "../lib/ai-audit";
import { recordDailySpend, evaluateSpend } from "../lib/spend-guards";

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

export function withAudit(actionPrefix: string) {
  return (req: any, res: any, next: any) => {
    const ctx = createAuditContext();
    res.on("finish", () => {
      if (!ctx.records.length || !req?.user?.id || res.statusCode >= 500) return;
      const subpath = req.path.replace(/\//g, ".").replace(/^\.+/, "");
      void persistRuntimeAuditRecords({
        userId: req.user.id,
        action: actionPrefix ? `${actionPrefix}.${subpath}` : subpath,
        records: ctx.records,
        requestMeta: { method: req.method, path: req.path },
      }).catch((error: unknown) =>
        log.error("Runtime audit persist exception", { error: getErrorMessage(error) }),
      );
    });
    runInAuditContext(ctx, () => next());
  };
}
