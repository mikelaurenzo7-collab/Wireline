import { and, eq, inArray, lte, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import * as base from "./job-queue-base";
import { reportError } from "./error-reporter";
import {
  isProviderSpendPausedError,
  PROVIDER_SPEND_PAUSE_DELAY_MS,
  providerSpendPauseSchedule,
} from "./provider-spend-job-pause";

// Public queue consumers must enter through this attempt-fenced facade. Export
// only the producer/statistics primitives that are safe to share; the base
// module's ID-only completion and unfenced worker helpers are intentionally not
// part of the public surface.
export {
  backoffSeconds,
  DEFAULT_MAX_ATTEMPTS,
  formatJobWorkerSweepError,
  getQueueStats,
  writeTransactionConfig,
} from "./job-queue-base";
export type {
  EnqueueResult,
  JobHandler,
  JobPayload,
  JobStatus,
  QueueStats,
} from "./job-queue-base";

export type JobType =
  | base.JobType
  | "post_call_artifact"
  | "post_call_digest"
  | "scheduled_report"
  | "twilio_message_reconciliation";
export interface JobRow extends Omit<base.JobRow, "type"> {
  type: JobType;
}
export interface EnqueueOptions extends Omit<base.EnqueueOptions, "type"> {
  type: JobType;
}
export interface WorkerOptions extends Omit<base.WorkerOptions, "typeFilter"> {
  typeFilter?: JobType[];
}

type QueueDb = Parameters<typeof base.enqueue>[0];

type ClaimedJobIdentity = {
  id: string;
  attempts?: number | null;
  maxAttempts?: number | null;
};

type ClaimOptions = {
  typeFilter?: JobType[];
  jobId?: string;
  userId?: string;
};

const CALLER_MANAGED_ENQUEUE_FAILURE_TYPES = new Set<JobType>(["campaign_dial"]);
const SINGLETON_SCHEDULER_TYPES = new Set<JobType>(["cadence_tick", "callback_tick"]);
const SINGLETON_SCHEDULER_INDEX = "uq_jobs_queued_scheduler_tick";
const STALE_RECOVERY_BATCH = 200;
const CLAIMABLE_STATUSES = ["pending", "failed"] as const;
const retryBudgetRemaining = sql`coalesce(${schema.jobs.attempts}, 0) < coalesce(${schema.jobs.maxAttempts}, ${base.DEFAULT_MAX_ATTEMPTS})`;
const runAtDue = (claimTime: Date) =>
  sql`coalesce(${schema.jobs.runAt}, ${claimTime}) <= ${claimTime}`;
// Daily retention creates one purge job per account. Keep maintenance fan-out
// behind due customer/scheduler work so bounded serverless sweeps stay responsive.
const claimPriority = sql`case when ${schema.jobs.type} = 'purge_old_data' then 1 else 0 end`;
const claimOrder = (claimTime: Date) =>
  sql`coalesce(${schema.jobs.runAt}, ${schema.jobs.createdAt}, ${claimTime})`;
const attemptCountEquals = (expectedAttempts: number) =>
  sql`coalesce(${schema.jobs.attempts}, 0) = ${expectedAttempts}`;

function isExpectedSingletonSchedulerConflict(
  opts: Pick<EnqueueOptions, "type">,
  result: base.EnqueueResult,
): boolean {
  return (
    !result.ok &&
    SINGLETON_SCHEDULER_TYPES.has(opts.type) &&
    String(result.error || "").includes(SINGLETON_SCHEDULER_INDEX)
  );
}

export function enforceDurableEnqueueResult(
  opts: Pick<EnqueueOptions, "type">,
  result: base.EnqueueResult,
): base.EnqueueResult {
  // The partial unique index is the concurrency boundary for waiting scheduler
  // ticks. Only that named conflict is an intentional durable no-op.
  if (isExpectedSingletonSchedulerConflict(opts, result)) return { ok: true };
  if (!result.ok && !CALLER_MANAGED_ENQUEUE_FAILURE_TYPES.has(opts.type)) {
    throw new Error(result.error || `Failed to enqueue ${opts.type} job`);
  }
  return result;
}

export async function enqueue(db: QueueDb, opts: EnqueueOptions): Promise<base.EnqueueResult> {
  const result = await base.enqueue(db, opts as base.EnqueueOptions);
  return enforceDurableEnqueueResult(opts, result);
}

/**
 * Claim the oldest due pending or retryable legacy-failed row while enforcing
 * the retry budget.
 *
 * Pending and failed rows compete in the same transaction by effective run
 * time. This preserves retry fairness under sustained new-work load and avoids
 * a second claim transaction. Historical rows with a null run_at are eligible
 * immediately and ordered by creation time instead of being left at NULLS LAST.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle rows remain camelCase.
async function claimEligibleJob(db: QueueDb, options: ClaimOptions): Promise<any | null> {
  return db.transaction(async (tx) => {
    const claimTime = new Date();
    const clauses = [
      inArray(schema.jobs.status, [...CLAIMABLE_STATUSES]),
      runAtDue(claimTime),
      retryBudgetRemaining,
    ];
    if (options.typeFilter?.length) {
      clauses.push(inArray(schema.jobs.type, options.typeFilter));
    }
    if (options.jobId) clauses.push(eq(schema.jobs.id, options.jobId));
    if (options.userId) clauses.push(eq(schema.jobs.userId, options.userId));

    const [job] = await tx
      .select()
      .from(schema.jobs)
      .where(and(...clauses))
      .orderBy(claimPriority, claimOrder(claimTime), schema.jobs.id)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;

    // The SQL predicate guarantees a claimable non-null status, but the schema
    // remains nullable for historical rows. Narrow it before building the
    // optimistic update fence so Drizzle receives a valid scalar operand.
    const expectedStatus = job.status;
    if (!expectedStatus) return null;
    const expectedAttempts = Number(job.attempts ?? 0);
    const updateClauses = [
      eq(schema.jobs.id, job.id),
      eq(schema.jobs.status, expectedStatus),
      attemptCountEquals(expectedAttempts),
      runAtDue(claimTime),
      retryBudgetRemaining,
    ];
    if (options.userId) updateClauses.push(eq(schema.jobs.userId, options.userId));

    const [updated] = await tx
      .update(schema.jobs)
      .set({
        status: "running",
        startedAt: claimTime,
        attempts: expectedAttempts + 1,
        updatedAt: claimTime,
      })
      .where(and(...updateClauses))
      .returning();
    return updated ?? null;
  }, base.writeTransactionConfig());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see claimEligibleJob above.
export async function claimJob(db: QueueDb, typeFilter?: JobType[]): Promise<any | null> {
  return claimEligibleJob(db, { typeFilter });
}

export async function claimJobById(
  db: QueueDb,
  jobId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see claimEligibleJob above.
): Promise<any | null> {
  return claimEligibleJob(db, { jobId, userId });
}

/**
 * Commit completion only while the row still represents the exact attempt that
 * produced the result. A stale worker must not overwrite a newer retry after
 * recovery has incremented the attempt counter.
 */
export async function completeClaimedJob(
  db: QueueDb,
  job: ClaimedJobIdentity,
  result?: base.JobPayload,
): Promise<boolean> {
  const expectedAttempts = Number(job.attempts || 0);
  const [updated] = await db.transaction(
    async (tx) =>
      tx
        .update(schema.jobs)
        .set({
          status: "done",
          finishedAt: new Date(),
          error: null,
          ...(result !== undefined ? { result } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.jobs.id, job.id),
            eq(schema.jobs.status, "running"),
            eq(schema.jobs.attempts, expectedAttempts),
          ),
        )
        .returning({ id: schema.jobs.id }),
    base.writeTransactionConfig(),
  );
  return Boolean(updated);
}

/**
 * Put non-exhausted work back into the claimable state after backoff. Both retry
 * and dead-letter writes are fenced to the exact running attempt, preventing a
 * late worker from clobbering a newer claim.
 */
export async function failJob(
  db: QueueDb,
  job: ClaimedJobIdentity,
  errorMessage: string,
): Promise<void> {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.maxAttempts || base.DEFAULT_MAX_ATTEMPTS);
  const exhausted = attempts >= maxAttempts;

  const [row] = await db
    .select({ type: schema.jobs.type })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, job.id))
    .limit(1);
  const longRunning = row?.type === "post_call_artifact" || row?.type === "scheduled_report";
  // Claimed rows use one-based attempt counts; backoffSeconds accepts a
  // zero-based failure index. Subtracting one preserves the documented
  // 30s → 2m → 10m → 1h schedule instead of silently skipping 30 seconds.
  const retryDelaySeconds = Math.max(
    base.backoffSeconds(Math.max(attempts - 1, 0)),
    longRunning ? 5 * 60 : 0,
  );

  const [updated] = await db.transaction(
    async (tx) =>
      tx
        .update(schema.jobs)
        .set({
          status: exhausted ? "dead" : "pending",
          error: errorMessage.slice(0, 2000),
          finishedAt: exhausted ? new Date() : null,
          runAt: exhausted ? new Date() : new Date(Date.now() + retryDelaySeconds * 1000),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.jobs.id, job.id),
            eq(schema.jobs.status, "running"),
            eq(schema.jobs.attempts, attempts),
          ),
        )
        .returning({ id: schema.jobs.id }),
    base.writeTransactionConfig(),
  );

  if (exhausted && updated) {
    reportError(new Error(`Job dead-lettered: ${errorMessage}`), {
      jobId: job.id,
      attempts,
      tags: { source: "job_queue", outcome: "dead_letter" },
    });
  }
}

/**
 * Return launch-gated provider work to pending without consuming the attempt
 * that claimEligibleJob added. The exact running-attempt fence prevents a late
 * pause from rewinding a newer worker's claim.
 */
export async function deferPausedProviderSpendJob(
  db: QueueDb,
  job: ClaimedJobIdentity,
  errorMessage: string,
  delayMs = PROVIDER_SPEND_PAUSE_DELAY_MS,
): Promise<boolean> {
  const claimedAttempts = Number(job.attempts || 0);
  const pausedAt = new Date();
  const schedule = providerSpendPauseSchedule(claimedAttempts, pausedAt, delayMs);

  const [updated] = await db.transaction(
    async (tx) =>
      tx
        .update(schema.jobs)
        .set({
          status: "pending",
          attempts: schedule.attempts,
          error: errorMessage.slice(0, 2000),
          startedAt: null,
          finishedAt: null,
          runAt: schedule.runAt,
          updatedAt: pausedAt,
        })
        .where(
          and(
            eq(schema.jobs.id, job.id),
            eq(schema.jobs.status, "running"),
            eq(schema.jobs.attempts, claimedAttempts),
          ),
        )
        .returning({ id: schema.jobs.id }),
    base.writeTransactionConfig(),
  );
  return Boolean(updated);
}

export type ClaimedJobErrorSettlement = "deferred" | "failed" | "stale";

/** Shared settlement for HTTP sweeps and persistent workers. */
export async function settleClaimedJobError(
  db: QueueDb,
  job: ClaimedJobIdentity,
  error: unknown,
): Promise<ClaimedJobErrorSettlement> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (isProviderSpendPausedError(error)) {
    const deferred = await deferPausedProviderSpendJob(db, job, errorMessage);
    return deferred ? "deferred" : "stale";
  }
  await failJob(db, job, errorMessage);
  return "failed";
}

/**
 * Recover stale jobs only while the row still represents the exact attempt
 * selected by this sweep. Status-only fencing can clobber a newer worker claim
 * when overlapping sweeps race under READ COMMITTED isolation.
 */
export async function recoverStaleJobs(
  db: QueueDb,
  staleAfterMs = 30 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  return db.transaction(async (tx) => {
    const staleJobs = await tx
      .select({
        id: schema.jobs.id,
        attempts: schema.jobs.attempts,
        maxAttempts: schema.jobs.maxAttempts,
      })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, "running"), lte(schema.jobs.startedAt, cutoff)))
      .orderBy(schema.jobs.startedAt, schema.jobs.id)
      .limit(STALE_RECOVERY_BATCH);

    let recovered = 0;
    for (const job of staleJobs) {
      const expectedAttempts = Number(job.attempts ?? 0);
      const exhausted = expectedAttempts >= Number(job.maxAttempts || base.DEFAULT_MAX_ATTEMPTS);
      const reset = await tx
        .update(schema.jobs)
        .set({
          status: exhausted ? "dead" : "pending",
          error: exhausted
            ? "Marked dead: stuck in running state beyond timeout"
            : "Reset from stale running state",
          startedAt: null,
          finishedAt: exhausted ? new Date() : null,
          runAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.jobs.id, job.id),
            eq(schema.jobs.status, "running"),
            attemptCountEquals(expectedAttempts),
          ),
        )
        .returning({ id: schema.jobs.id });
      if (reset.length) recovered++;
    }

    return recovered;
  }, base.writeTransactionConfig());
}

/**
 * Worker loop using the same attempt-fenced completion and failure semantics as
 * the serverless sweep. This intentionally does not use base.startWorker,
 * whose ID-only completion helper cannot distinguish a recovered retry from a
 * stale original attempt.
 */
export function startWorker(
  db: QueueDb,
  handler: (job: JobRow) => Promise<void>,
  opts: WorkerOptions = {},
): () => void {
  const pollMs = opts.pollIntervalMs ?? 10_000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sweep = async () => {
    if (stopped) return;
    try {
      for (let i = 0; i < 10 && !stopped; i++) {
        const job = await claimJob(db, opts.typeFilter);
        if (!job) break;
        try {
          await handler(job as JobRow);
          await completeClaimedJob(db, job);
        } catch (error) {
          await settleClaimedJobError(db, job, error);
        }
      }
    } catch (error) {
      opts.onError?.(new Error(base.formatJobWorkerSweepError(error)));
    }
    if (!stopped) timer = setTimeout(sweep, pollMs);
  };

  timer = setTimeout(sweep, 0);
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
