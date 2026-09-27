/* eslint-disable @typescript-eslint/no-explicit-any */
import { drizzle, log, quotaTracker } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { enqueue, writeTransactionConfig } from "../lib/job-queue";
import { reportError } from "../lib/error-reporter";
import { getErrorMessage } from "../lib/server-utils";
import { dailyPeriodKey } from "../lib/tenant-quotas";
import {
  createAuditContext,
  resolveRuntimeCallCost,
  runInAuditContext,
  type RuntimeCallMeta,
} from "../lib/ai-audit";
import { clearBudgetCache, recordDailySpend, evaluateSpend } from "../lib/spend-guards";
import { normalizeUsageTokenCount, saturatingUsageTokenSum } from "../lib/ai-usage";
import {
  managedAiSpendPredicate,
  providerSpendMeter,
  type ProviderSpendMeter,
} from "../lib/provider-spend-meter";
import {
  OPENAI_REALTIME_RESERVE_ENV,
  OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD,
  resolveOpenAIRealtimeSessionReserveUsd,
} from "../lib/voice/openai-realtime-pricing";

export type AiSpendAccountingJobPayload = {
  userId: string;
  action: string;
  records: RuntimeCallMeta[];
  requestMeta?: Record<string, unknown>;
};

const AI_SPEND_ACCOUNTING_RECEIPT = "ai_spend_accounting_persisted";
const AI_TOKEN_DIMENSION = "claude_tokens_daily";

function runtimeAuditRows(opts: AiSpendAccountingJobPayload) {
  return opts.records.map((record) => {
    const cost = resolveRuntimeCallCost(record);
    return {
      userId: opts.userId,
      action: opts.action,
      provider: record.provider,
      model: record.model,
      inputTokens: normalizeUsageTokenCount(record.input_tokens),
      outputTokens: normalizeUsageTokenCount(record.output_tokens),
      cacheReadTokens: normalizeUsageTokenCount(record.cache_read_tokens),
      cacheCreateTokens: normalizeUsageTokenCount(record.cache_create_tokens),
      costUsd: String(cost.costUsd),
      latencyMs: normalizeUsageTokenCount(record.latency_ms),
      metadata: {
        ...(opts.requestMeta || {}),
        cost_basis: cost.costBasis,
      },
    };
  });
}

async function applyRuntimeAuditCounters(opts: AiSpendAccountingJobPayload): Promise<void> {
  const rows = runtimeAuditRows(opts);
  const deltaUsd = rows.reduce((sum: number, row: any) => sum + Number(row.costUsd || 0), 0);
  const tokenDelta = rows.reduce(
    (sum, row) =>
      saturatingUsageTokenSum(
        sum,
        row.inputTokens,
        row.outputTokens,
        row.cacheReadTokens,
        row.cacheCreateTokens,
      ),
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

function runtimeTokenDelta(opts: AiSpendAccountingJobPayload): number {
  return opts.records.reduce(
    (sum, record) =>
      saturatingUsageTokenSum(
        sum,
        record.input_tokens,
        record.output_tokens,
        record.cache_read_tokens,
        record.cache_create_tokens,
      ),
    0,
  );
}

async function publishRuntimeAuditTelemetry(opts: AiSpendAccountingJobPayload): Promise<void> {
  const deltaUsd = runtimeAuditRows(opts).reduce(
    (sum: number, row: any) => sum + Number(row.costUsd || 0),
    0,
  );
  // This rolling Redis/memory accumulator is explicitly telemetry-only. The
  // authoritative tenant spend ledger is wireline_audit_log, persisted in the
  // worker transaction below. Keeping this outside the Postgres transaction
  // avoids pretending two different stores can commit atomically.
  recordDailySpend(deltaUsd);
  await evaluateSpend(opts.userId, deltaUsd).catch((error: unknown) =>
    log.error("Runtime spend evaluation failed", { error: getErrorMessage(error) }),
  );
}

export async function persistRuntimeAuditRecords(opts: {
  userId: string;
  action: string;
  records: RuntimeCallMeta[];
  requestMeta?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.records.length) return;
  const rows = runtimeAuditRows(opts);
  try {
    await drizzle.insert(schema.auditLog).values(rows);
  } catch (error) {
    log.error("Runtime audit insert failed", { error: getErrorMessage(error) });
    return;
  }
  await applyRuntimeAuditCounters(opts);
}

/**
 * Persist one queued request's usage and its completion marker atomically.
 * The job marker is the retry receipt: if a worker dies after this transaction
 * but before queue completion, the next attempt observes it and cannot insert
 * the same spend twice.
 */
export async function persistRuntimeAuditRecordsForJob(
  input: AiSpendAccountingJobPayload & { jobId: string; attempt: number },
  deps: {
    db?: Pick<typeof drizzle, "transaction">;
    publishTelemetry?: (payload: AiSpendAccountingJobPayload) => Promise<void>;
  } = {},
): Promise<boolean> {
  if (!input.records.length) return false;
  const db = deps.db ?? drizzle;
  const rows = runtimeAuditRows(input).map((row) => ({
    ...row,
    metadata: { ...row.metadata, accounting_job_id: input.jobId },
  }));
  const persisted = await db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        status: schema.jobs.status,
        attempts: schema.jobs.attempts,
        result: schema.jobs.result,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, input.jobId))
      .limit(1)
      .for("update");
    if (!job) throw new Error("AI spend accounting job disappeared before persistence.");
    const priorResult =
      job.result && typeof job.result === "object" && !Array.isArray(job.result)
        ? (job.result as Record<string, unknown>)
        : {};
    if (priorResult[AI_SPEND_ACCOUNTING_RECEIPT] === true) return false;
    if (job.status !== "running" || Number(job.attempts || 0) !== input.attempt) {
      throw new Error("AI spend accounting job lost its durable attempt claim.");
    }

    await tx.insert(schema.auditLog).values(rows);
    const tokenDelta = runtimeTokenDelta(input);
    if (tokenDelta > 0) {
      // The aggregate and the per-call ledger share the job receipt's exact
      // transaction. A worker crash can therefore leave all three committed or
      // all three retryable, never an audit row without its daily quota usage.
      await tx
        .insert(schema.quotaUsage)
        .values({
          userId: input.userId,
          dimension: AI_TOKEN_DIMENSION,
          periodKey: dailyPeriodKey(),
          used: BigInt(tokenDelta),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.quotaUsage.userId,
            schema.quotaUsage.dimension,
            schema.quotaUsage.periodKey,
          ],
          set: {
            used: sql`${schema.quotaUsage.used} + ${BigInt(tokenDelta)}`,
            updatedAt: new Date(),
          },
        });
    }
    const [marked] = await tx
      .update(schema.jobs)
      .set({
        result: {
          ...priorResult,
          [AI_SPEND_ACCOUNTING_RECEIPT]: true,
          accounting_attempt: input.attempt,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.status, "running"),
          eq(schema.jobs.attempts, input.attempt),
        ),
      )
      .returning({ id: schema.jobs.id });
    if (!marked) throw new Error("AI spend accounting receipt lost its attempt fence.");
    return true;
  }, writeTransactionConfig());

  if (persisted) await (deps.publishTelemetry ?? publishRuntimeAuditTelemetry)(input);
  return persisted;
}

type RuntimeAuditEndDeps = {
  enqueueJob?: (payload: AiSpendAccountingJobPayload) => Promise<unknown>;
  reportFailure?: (error: unknown, payload: AiSpendAccountingJobPayload) => void;
};

/**
 * Hold only the final Express response boundary until its minimal durable job
 * exists. This preserves every `res.end` overload and lets streaming routes
 * flush events normally; only their terminal FIN waits for one queue INSERT.
 */
export function holdResponseEndForRuntimeAudit(
  res: any,
  takePayload: () => AiSpendAccountingJobPayload | null,
  deps: RuntimeAuditEndDeps = {},
): void {
  const originalEnd = res.end.bind(res);
  let endRequested = false;
  let endReleased = false;

  res.end = (...args: any[]) => {
    // Express/Node occasionally reaches end twice through nested error paths.
    // The first caller owns both persistence and the original end invocation.
    if (endRequested || endReleased) return res;
    endRequested = true;

    let payload: AiSpendAccountingJobPayload | null;
    try {
      payload = takePayload();
    } catch (error) {
      log.error("AI spend accounting payload capture failed before response end", {
        error: getErrorMessage(error),
      });
      try {
        reportError(error, {
          tags: { surface: "response_boundary", operation: "ai_spend_accounting_capture" },
        });
      } catch (reportingError) {
        log.error("AI spend accounting payload failure reporting failed", {
          error: getErrorMessage(reportingError),
        });
      }
      endReleased = true;
      return originalEnd(...args);
    }
    if (!payload) {
      endReleased = true;
      return originalEnd(...args);
    }

    const enqueueJob =
      deps.enqueueJob ??
      ((jobPayload: AiSpendAccountingJobPayload) =>
        enqueue(drizzle, {
          userId: jobPayload.userId,
          type: "ai_spend_accounting",
          payload: jobPayload,
        }));
    const reportFailure =
      deps.reportFailure ??
      ((error: unknown, jobPayload: AiSpendAccountingJobPayload) => {
        log.error("AI spend accounting enqueue failed before response end", {
          userId: jobPayload.userId,
          action: jobPayload.action,
          error: getErrorMessage(error),
        });
        reportError(error, {
          tags: { surface: "response_boundary", operation: "ai_spend_accounting_enqueue" },
        });
      });

    // An async IIFE converts synchronous producer throws into the same rejection
    // path. `finally` releases the socket exactly once, so a queue outage is
    // visible but can never strand an HTTP/SSE response indefinitely.
    void (async () => enqueueJob(payload))()
      .catch((error: unknown) => {
        try {
          reportFailure(error, payload);
        } catch (reportingError) {
          log.error("AI spend accounting enqueue failure reporting failed", {
            error: getErrorMessage(reportingError),
          });
        }
      })
      .finally(() => {
        if (endReleased) return;
        endReleased = true;
        originalEnd(...args);
      });

    // Node's ServerResponse.end() returns the response. Preserve that contract
    // while persistence completes asynchronously behind this final boundary.
    return res;
  };
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
   * mint is the only place the platform can meter it. The fallback is derived
   * in openai-realtime-pricing.ts from official gpt-realtime-2.1 audio rates;
   * explicit overrides below that floor fail closed.
   */
  openai_realtime_session: {
    env: OPENAI_REALTIME_RESERVE_ENV,
    fallback: OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD,
  },
} as const;

export function platformCostReserveUsd(kind: keyof typeof PLATFORM_COST_RESERVES): number {
  if (kind === "openai_realtime_session") {
    return resolveOpenAIRealtimeSessionReserveUsd();
  }
  const reserve = PLATFORM_COST_RESERVES[kind];
  const parsed = Number.parseFloat(process.env[reserve.env] || "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : reserve.fallback;
}

export async function persistPlatformCostRecord(opts: {
  userId: string | null;
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
  if (opts.userId) {
    await evaluateSpend(opts.userId, opts.costUsd).catch((error: unknown) =>
      log.error("Platform cost spend evaluation failed", { error: getErrorMessage(error) }),
    );
  }
}

export type PlatformCostReservation = {
  auditId: bigint;
  userId: string;
  costUsd: number;
  /** True when this request reused an earlier durable debit. */
  adopted: boolean;
  meter?: ProviderSpendMeter;
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
 * browser receives a provider-funded realtime session. Server-owned phone
 * receipts retain durable provider COGS here; the voice admission policy owns
 * their included-minute/Runtime Balance coverage instead of the AI cap.
 */
export async function reservePlatformCostRecord(opts: {
  userId: string;
  action: string;
  provider: string;
  model: string;
  costUsd: number;
  idempotencyKey?: string;
  requestMeta?: Record<string, unknown>;
}): Promise<PlatformCostReservationDecision> {
  if (!(opts.costUsd > 0) || !Number.isFinite(opts.costUsd)) {
    return { reserved: false, reason: "unavailable" };
  }
  const period = new Date().toISOString().slice(0, 7);
  const periodStart = new Date(`${period}-01T00:00:00.000Z`);
  const meter = providerSpendMeter({ ...opts, metadata: opts.requestMeta });

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

      const idempotencyKey = String(opts.idempotencyKey || "").trim() || null;
      if (idempotencyKey) {
        const [existing] = await tx
          .select({
            id: schema.auditLog.id,
            costUsd: schema.auditLog.costUsd,
            action: schema.auditLog.action,
            provider: schema.auditLog.provider,
            metadata: schema.auditLog.metadata,
          })
          .from(schema.auditLog)
          .where(
            and(
              eq(schema.auditLog.userId, opts.userId),
              eq(schema.auditLog.action, opts.action),
              eq(schema.auditLog.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          return {
            reserved: true,
            reservation: {
              auditId: existing.id,
              userId: opts.userId,
              costUsd: Number(existing.costUsd || opts.costUsd),
              adopted: true,
              meter: providerSpendMeter(existing),
            },
          } as const;
        }
      }

      const monthlyLimitUsd = Number(budget.monthlyLimitUsd || 0);
      const hardCapEnabled = budget.enabled !== false && budget.hardCap === true;
      if (meter === "managed_ai" && hardCapEnabled && !(monthlyLimitUsd > 0)) {
        return { reserved: false, reason: "unavailable" } as const;
      }

      const [mtd] = await tx
        .select({
          costUsd: sql<string>`coalesce(sum(${schema.auditLog.costUsd}), 0)`.mapWith(String),
        })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.userId, opts.userId),
            gte(schema.auditLog.createdAt, periodStart),
            managedAiSpendPredicate(),
          ),
        );
      const monthToDateUsd = Number(mtd?.costUsd || 0);
      if (
        meter === "managed_ai" &&
        hardCapEnabled &&
        monthToDateUsd + opts.costUsd > monthlyLimitUsd
      ) {
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
          idempotencyKey,
          metadata: { ...(opts.requestMeta || {}), accounting_state: "reserved_before_provider" },
        })
        .returning({ id: schema.auditLog.id });
      if (!row) throw new Error("Platform cost reservation insert returned no row.");

      return {
        reserved: true,
        reservation: {
          auditId: row.id,
          userId: opts.userId,
          costUsd: opts.costUsd,
          adopted: false,
          meter,
        },
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
export async function releasePlatformCostReservationIfReserved(
  reservation: PlatformCostReservation,
): Promise<boolean> {
  // An adopted receipt may belong to a prior provider attempt that succeeded
  // before its worker crashed. Only the request that created a fresh debit can
  // prove that a definitive pre-provider failure is safe to refund.
  if (reservation.adopted !== false) return false;
  const [released] = await drizzle
    .delete(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.id, reservation.auditId),
        eq(schema.auditLog.userId, reservation.userId),
        sql`${schema.auditLog.metadata}->>'accounting_state' = 'reserved_before_provider'`,
      ),
    )
    .returning({ id: schema.auditLog.id });
  if (released) clearBudgetCache(reservation.userId);
  return Boolean(released);
}

/** Backwards-compatible release for callers that do not need transition status. */
export async function releasePlatformCostReservation(
  reservation: PlatformCostReservation,
): Promise<void> {
  await releasePlatformCostReservationIfReserved(reservation);
}

async function setPlatformCostReservationState(
  reservation: PlatformCostReservation,
  accountingState: "committed" | "provider_outcome_ambiguous",
): Promise<boolean> {
  try {
    const transitionPredicate =
      accountingState === "provider_outcome_ambiguous"
        ? sql`${schema.auditLog.metadata}->>'accounting_state' = 'reserved_before_provider'`
        : sql`${schema.auditLog.metadata}->>'accounting_state' IS DISTINCT FROM 'committed'`;
    const [updated] = await drizzle
      .update(schema.auditLog)
      .set({
        metadata: sql`coalesce(${schema.auditLog.metadata}, '{}'::jsonb) || ${JSON.stringify({
          accounting_state: accountingState,
        })}::jsonb`,
      })
      .where(
        and(
          eq(schema.auditLog.id, reservation.auditId),
          eq(schema.auditLog.userId, reservation.userId),
          transitionPredicate,
        ),
      )
      .returning({ id: schema.auditLog.id });
    return Boolean(updated);
  } catch (error) {
    // Never delete or refund the reserve when state telemetry fails: provider
    // spend may already exist, and the original row remains conservative.
    log.error("Platform cost reservation state update failed", {
      auditId: reservation.auditId.toString(),
      userId: reservation.userId,
      accountingState,
      error: getErrorMessage(error),
    });
    return false;
  }
}

export async function markPlatformCostReservationAmbiguous(
  reservation: PlatformCostReservation,
): Promise<void> {
  await setPlatformCostReservationState(reservation, "provider_outcome_ambiguous");
}

/** Publish telemetry after the already-durable reservation becomes real spend. */
export async function commitPlatformCostReservation(
  reservation: PlatformCostReservation,
): Promise<void> {
  const transitioned = await setPlatformCostReservationState(reservation, "committed");
  if (!transitioned) return;
  recordDailySpend(reservation.costUsd);
  // Live phone usage settles against included voice/Runtime Balance. Retain
  // provider COGS telemetry without publishing false managed-AI budget alerts.
  if (reservation.meter === "live_voice") return;
  await evaluateSpend(reservation.userId, reservation.costUsd).catch((error: unknown) =>
    log.error("Reserved platform cost spend evaluation failed", {
      userId: reservation.userId,
      error: getErrorMessage(error),
    }),
  );
}

/**
 * Account elapsed, already-admitted SIP work without interrupting a live call.
 * This is a conservative provider estimate, not a customer wallet charge.
 * Lock the same budget row as admission so concurrent new work sees the debit;
 * retries and shorter final elapsed reports can never reduce recorded spend.
 */
export async function extendCommittedPlatformCostReservation(
  reservation: PlatformCostReservation,
  elapsedSeconds: number,
): Promise<void> {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("Realtime elapsed duration must be finite and nonnegative.");
  }
  const windows = Math.max(1, Math.ceil(elapsedSeconds / 300));
  const delta = await drizzle.transaction(async (tx) => {
    await tx
      .select({ userId: schema.spendBudgets.userId })
      .from(schema.spendBudgets)
      .where(eq(schema.spendBudgets.userId, reservation.userId))
      .for("update");
    const [row] = await tx
      .select({
        action: schema.auditLog.action,
        provider: schema.auditLog.provider,
        costUsd: schema.auditLog.costUsd,
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
    const metadata: Record<string, unknown> =
      row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    // The caller holds an admitted SIP session or authoritative terminal call.
    // A transient initial commit-metadata failure must be recoverable here.
    const state = metadata.accounting_state;
    if (
      !row ||
      providerSpendMeter(row) !== "live_voice" ||
      !["committed", "reserved_before_provider", "provider_outcome_ambiguous"].includes(
        String(state),
      )
    ) {
      throw new Error("Admitted realtime spend receipt is unavailable.");
    }
    const recoveringCommit = state !== "committed";
    const unit = Number(metadata.reserve_window_usd ?? reservation.costUsd);
    if (!(unit > 0) || !Number.isFinite(unit)) throw new Error("Invalid realtime reserve window.");
    const previous = Number(row.costUsd || 0);
    const next = Math.max(previous, Math.round(unit * windows * 100) / 100);
    if (next === previous && !recoveringCommit) return 0;
    await tx
      .update(schema.auditLog)
      .set({
        costUsd: String(next),
        metadata: {
          ...metadata,
          accounting_state: "committed",
          reserve_window_usd: unit,
          reserve_window_seconds: 300,
          observed_duration_seconds: Math.ceil(elapsedSeconds),
          cost_basis: metadata.provider_usage_observed
            ? "realtime_observed_with_duration_reserve_floor"
            : "realtime_duration_estimate",
        },
      })
      .where(
        and(
          eq(schema.auditLog.id, reservation.auditId),
          eq(schema.auditLog.userId, reservation.userId),
        ),
      );
    return recoveringCommit ? next : next - previous;
  });
  if (delta > 0) {
    clearBudgetCache(reservation.userId);
    recordDailySpend(delta);
  }
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
    holdResponseEndForRuntimeAudit(res, () => {
      // Persist on 5xx too: the provider already billed the model call, so a
      // handler failure after the model returned must still land in the spend
      // ledger or the tenant's budget drifts under exactly the retry loops
      // most likely to burn money. Take and clear the records at finalization;
      // streaming writes remain immediate and cannot grow a post-end buffer.
      if (!ctx.records.length || !req?.user?.id) return null;
      const subpath = req.path.replace(/\//g, ".").replace(/^\.+/, "");
      const records = ctx.records.splice(0, ctx.records.length).map((record) => ({ ...record }));
      // Keep the response open for the queue INSERT, then let the durable worker
      // atomically persist usage, its quota aggregate, and the retry receipt.
      // Vercel cannot freeze the invocation between provider spend and enqueue.
      const payload: AiSpendAccountingJobPayload = {
        userId: req.user.id,
        action: actionPrefix ? `${actionPrefix}.${subpath}` : subpath,
        records,
        requestMeta: { method: req.method, path: req.path, status: res.statusCode },
      };
      return payload;
    });
    runInAuditContext(ctx, () => next());
  };
}
