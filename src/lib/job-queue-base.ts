/* eslint-disable @typescript-eslint/no-explicit-any -- job and webhook payloads are stored as Postgres jsonb. */
// Postgres-backed durable job queue.
//
// Why Postgres (not BullMQ / SQS / Inngest)?
// • No extra infra dependency — Supabase is already required.
// • Survives serverless function restarts (Vercel / Railway).
// • Atomic claim via `SELECT … FOR UPDATE SKIP LOCKED` — the same
//   pattern powering pg-boss and Graphile Worker.
// • Easy to inspect / manually retry from the Supabase dashboard.
//
// Architecture:
//   Producers  → INSERT into wireline_jobs
//   Workers    → SELECT FOR UPDATE SKIP LOCKED + UPDATE to "running"
//              → process → UPDATE to "done" | "failed"
//   Retry      → On failure, reschedule at `now + backoff(attempts)`
//              → dead-lettered after MAX_ATTEMPTS
//
// One worker polling interval runs inside the Express process on
// a 10-second timer (clearable for clean shutdown). On Vercel
// serverless, callers should also trigger a sweep from a
// `POST /api/jobs/sweep` endpoint to compensate for cold-start gaps.

import { drizzle, tenantStore } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, sql, lte, gte, inArray } from "drizzle-orm";
import { reportError } from "./error-reporter";
import { getErrorMessage } from "./server-utils";

type DrizzleDB = typeof drizzle;

const WRITE_TRANSACTION_CONFIG = { accessMode: "read write" as const };

/**
 * Tenant-scoped checkouts already open an outer READ WRITE transaction in
 * server-context. Unscoped workers and cron routes need Drizzle to declare the
 * same access mode on their own transaction so a reused Supavisor backend
 * cannot inherit a leaked session-level read-only default.
 */
function writeTransactionConfig(): typeof WRITE_TRANSACTION_CONFIG | undefined {
  return tenantStore.getStore() ? undefined : WRITE_TRANSACTION_CONFIG;
}

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type JobStatus = "pending" | "running" | "done" | "failed" | "dead";

export type JobType =
  | "post_call_enrichment" // Async Claude post-call analysis replacing inline call
  | "webhook_delivery" // Re-use / extend existing webhook retry mechanism
  | "vapi_webhook" // Async Vapi webhook processing (end-of-call, status updates)
  | "daily_brief" // Pre-compute Account Holder daily brief
  | "campaign_dial" // One outbound dial within a campaign
  | "consent_check" // Pre-call TCPA gateway check
  | "purge_old_data" // GDPR data-retention TTL purge (nightly, per-tenant)
  | "purge_deleted_account" // GDPR Phase 1.5 — hard-delete account after 30-day grace
  | "google_drive_ingest" // Sync documents via Gemini
  | "adaptive_optimization" // Auto-tune agent from low-scoring calls
  | "v2a_action_extraction" // Voice-to-Action: extract action items from a call transcript
  | "execute_action" // Execute an extracted action via the Action Engine
  | "calendar_sync" // Sync Google/Outlook calendars
  | "proactive_lead_enrichment" // Async lead enrichment
  | "autonomous_prospecting" // AI-driven lead discovery
  | "knowledge_from_url" // Async site crawl → structured knowledge entries
  | "cadence_tick" // Multi-touch outbound cadence step processor
  | "callback_tick" // Caller-requested callback executor (due callback_scheduled_at rows)
  | "auto_qa_score" // Auto-QA every completed call → chains adaptive_optimization on low score
  | "sweep_orphan_supervisor_subs" // Daily janitor: delete subscription rows whose callId no longer references a call_log row
  | "trial_ending_soon_email" // Notify trialing user when trial ends within 3 days
  | "demo_line_canary" // Nightly probe of showcase phone lines (Vapi number + assistant health)
  | "margin_at_risk_alert"; // Daily founder alert for thin-margin tenants

export interface JobPayload extends Record<string, unknown> {}

export interface JobRow {
  id: string;
  user_id: string;
  type: JobType;
  payload: JobPayload;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: string; // ISO — when the job is eligible to be picked up
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────
// Backoff
// ─────────────────────────────────────────────────────────────────

const BACKOFF_SCHEDULE_SECONDS = [30, 120, 600, 3600]; // 30s, 2m, 10m, 1h

/** Seconds to wait before retrying after `attempt` (0-indexed) failures. */
export function backoffSeconds(attempt: number): number {
  return BACKOFF_SCHEDULE_SECONDS[Math.min(attempt, BACKOFF_SCHEDULE_SECONDS.length - 1)];
}

export const DEFAULT_MAX_ATTEMPTS = BACKOFF_SCHEDULE_SECONDS.length + 1; // = 5

// ─────────────────────────────────────────────────────────────────
// Producer
// ─────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  userId: string;
  type: JobType;
  payload: JobPayload;
  runAt?: Date; // Default: now (run immediately)
  maxAttempts?: number; // Default: DEFAULT_MAX_ATTEMPTS
}

export interface EnqueueResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}

export async function enqueue(db: DrizzleDB, opts: EnqueueOptions): Promise<EnqueueResult> {
  const runAt = opts.runAt ?? new Date();
  try {
    const data = await db.transaction(
      async (tx) => {
        const [row] = await tx
          .insert(schema.jobs)
          .values({
            userId: opts.userId,
            type: opts.type,
            payload: opts.payload,
            status: "pending" as JobStatus,
            attempts: 0,
            maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            runAt: runAt,
          })
          .returning({ id: schema.jobs.id });
        return row;
      },
      writeTransactionConfig(),
    );

    return { ok: true, jobId: data.id };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// Consumer — claim one due job (atomic)
// ─────────────────────────────────────────────────────────────────

/**
 * Attempt to atomically claim one due pending or retryable-failed job.
 * Inside one database transaction, the worker selects the oldest eligible
 * row with `FOR UPDATE SKIP LOCKED`, then marks it running and increments
 * its attempt count before commit. Pending jobs and failed jobs whose
 * backoff has elapsed are both eligible.
 *
 * Returns the claimed due job row, or null when the queue is idle.
 */
export async function claimJob(db: DrizzleDB, typeFilter?: JobType[]): Promise<any | null> {
  return await db.transaction(async (tx) => {
    const whereClauses = [
      inArray(schema.jobs.status, ["pending", "failed"]),
      lte(schema.jobs.runAt, new Date()),
    ];
    if (typeFilter?.length) {
      whereClauses.push(inArray(schema.jobs.type, typeFilter));
    }

    const [job] = await tx
      .select()
      .from(schema.jobs)
      .where(and(...whereClauses))
      .orderBy(schema.jobs.runAt)
      .limit(1)
      .for("update", { skipLocked: true });

    if (!job) return null;

    const updatedRows = (await tx
      .update(schema.jobs)
      .set({
        status: "running" as JobStatus,
        startedAt: new Date(),
        attempts: (job.attempts ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id))
      .returning()) as Array<typeof job>;
    const updated = updatedRows[0];

    return updated;
  }, writeTransactionConfig());
}

/** Atomically claim one due pending or retryable-failed job owned by a tenant. */
export async function claimJobById(
  db: DrizzleDB,
  jobId: string,
  userId: string,
): Promise<any | null> {
  return await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, jobId),
          eq(schema.jobs.userId, userId),
          inArray(schema.jobs.status, ["pending", "failed"]),
          lte(schema.jobs.runAt, new Date()),
        ),
      )
      .limit(1)
      .for("update", { skipLocked: true });

    if (!job) return null;

    const updatedRows = (await tx
      .update(schema.jobs)
      .set({
        status: "running" as JobStatus,
        startedAt: new Date(),
        attempts: (job.attempts ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id))
      .returning()) as Array<typeof job>;
    return updatedRows[0] ?? null;
  }, writeTransactionConfig());
}

// ─────────────────────────────────────────────────────────────────
// Completion helpers
// ─────────────────────────────────────────────────────────────────

export async function completeJob(
  db: DrizzleDB,
  jobId: string,
  result?: JobPayload,
): Promise<void> {
  await db.transaction(
    async (tx) => {
      await tx
        .update(schema.jobs)
        .set({
          status: "done" as JobStatus,
          finishedAt: new Date(),
          error: null,
          ...(result !== undefined ? { result } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.jobs.id, jobId));
    },
    writeTransactionConfig(),
  );
}

export async function failJob(
  db: DrizzleDB,
  job: Pick<schema.Job, "id" | "attempts" | "maxAttempts">,
  errorMessage: string,
): Promise<void> {
  const exhausted = (job.attempts || 0) >= (job.maxAttempts || 5);
  const nextRunAt = exhausted
    ? null
    : new Date(Date.now() + backoffSeconds(job.attempts || 0) * 1000);

  await db.transaction(
    async (tx) => {
      await tx
        .update(schema.jobs)
        .set({
          status: (exhausted ? "dead" : "failed") as JobStatus,
          error: errorMessage.slice(0, 2000),
          finishedAt: exhausted ? new Date() : null,
          runAt: nextRunAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.jobs.id, job.id));
    },
    writeTransactionConfig(),
  );

  // Alert only on dead-letter (retries exhausted) — transient failures that
  // will be retried are noise. A dead job means real work (post-call
  // analysis, webhook delivery, account purge) was silently dropped.
  if (exhausted) {
    reportError(new Error(`Job dead-lettered: ${errorMessage}`), {
      jobId: job.id,
      attempts: job.attempts ?? 0,
      tags: { source: "job_queue", outcome: "dead_letter" },
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// Worker loop
// ─────────────────────────────────────────────────────────────────

export type JobHandler = (job: JobRow) => Promise<void>;

/** Human-readable message when the poll loop throws (Drizzle often uses empty `.message`). */
export function formatJobWorkerSweepError(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg =
      err instanceof Error
        ? err.message.trim()
        : typeof o.message === "string"
          ? o.message.trim()
          : "";
    if (msg) return msg;
    const cause = o.cause;
    if (typeof cause === "string" && cause.trim()) return cause;
    if (cause instanceof Error && cause.message.trim()) return cause.message;
    if (typeof o.code === "string") return `database error (${o.code})`;
  }
  const base = getErrorMessage(err).trim();
  if (base && base !== "[object Object]") return base;
  return "job queue poll failed (database unreachable or misconfigured POSTGRES_URL)";
}

export interface WorkerOptions {
  /** Interval between sweeps when idle. Default: 10 seconds. */
  pollIntervalMs?: number;
  /** Job types this worker processes. Default: all. */
  typeFilter?: JobType[];
  /** Called when an unexpected error hits the poll loop itself. */
  onError?: (err: Error) => void;
}

/**
 * Start a background worker that polls the queue and dispatches jobs
 * to the provided handler. Returns a `stop()` function for graceful
 * shutdown.
 *
 * Usage:
 *   const stop = startWorker(db, myHandler, { pollIntervalMs: 5000 });
 *   process.on("SIGTERM", stop);
 */
export function startWorker(db: DrizzleDB, handler: any, opts: WorkerOptions = {}): () => void {
  const pollMs = opts.pollIntervalMs ?? 10_000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function sweep(): Promise<void> {
    if (stopped) return;
    try {
      // Drain up to 10 jobs per sweep to keep latency low without
      // starving the event loop for long-running handlers.
      for (let i = 0; i < 10; i++) {
        if (stopped) break;
        const job = await claimJob(db, opts.typeFilter);
        if (!job) break; // queue idle

        try {
          await handler(job);
          await completeJob(db, job.id);
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          await failJob(db, job, msg);
        }
      }
    } catch (err: unknown) {
      opts.onError?.(new Error(formatJobWorkerSweepError(err)));
    }
    if (!stopped) {
      timer = setTimeout(sweep, pollMs);
    }
  }

  // Kick off immediately
  timer = setTimeout(sweep, 0);

  return function stop() {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * Recover jobs stuck in "running" state for longer than the timeout.
 * Jobs that were claimed but never completed (e.g., worker crash) are
 * reset to "pending" for retry, or marked "dead" if max attempts exceeded.
 * Should be called periodically (e.g., every 5 minutes from the sweep cron).
 */
export async function recoverStaleJobs(
  db: DrizzleDB,
  staleAfterMs = 30 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  return await db.transaction(
    async (tx) => {
      const staleJobs = await tx
        .select({
          id: schema.jobs.id,
          attempts: schema.jobs.attempts,
          maxAttempts: schema.jobs.maxAttempts,
        })
        .from(schema.jobs)
        .where(
          and(eq(schema.jobs.status, "running" as JobStatus), lte(schema.jobs.startedAt, cutoff)),
        );

      let recovered = 0;
      for (const job of staleJobs) {
        const exhausted = (job.attempts || 0) >= (job.maxAttempts || 5);
        await tx
          .update(schema.jobs)
          .set({
            status: (exhausted ? "dead" : "pending") as JobStatus,
            error: exhausted
              ? "Marked dead: stuck in running state beyond timeout"
              : "Reset from stale running state",
            runAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.jobs.id, job.id));
        recovered++;
      }

      return recovered;
    },
    writeTransactionConfig(),
  );
}

// ─────────────────────────────────────────────────────────────────
// Stats helper — for health endpoint / monitoring
// ─────────────────────────────────────────────────────────────────

export interface QueueStats {
  pending: number;
  running: number;
  failed: number;
  dead: number;
  done_last_hour: number;
}

export async function getQueueStats(db: DrizzleDB, userId?: string): Promise<QueueStats> {
  const anHourAgo = new Date(Date.now() - 3_600_000);

  const [pending, running, failed, dead, done] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.status, "pending"), userId ? eq(schema.jobs.userId, userId) : undefined),
      )
      .then((r) => r[0].count),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.status, "running"), userId ? eq(schema.jobs.userId, userId) : undefined),
      )
      .then((r) => r[0].count),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.status, "failed"), userId ? eq(schema.jobs.userId, userId) : undefined),
      )
      .then((r) => r[0].count),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.status, "dead"), userId ? eq(schema.jobs.userId, userId) : undefined),
      )
      .then((r) => r[0].count),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, "done"),
          gte(schema.jobs.finishedAt, anHourAgo),
          userId ? eq(schema.jobs.userId, userId) : undefined,
        ),
      )
      .then((r) => r[0].count),
  ]);

  return {
    pending: pending || 0,
    running: running || 0,
    failed: failed || 0,
    dead: dead || 0,
    done_last_hour: done || 0,
  };
}
