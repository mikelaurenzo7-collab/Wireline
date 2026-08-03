import { and, eq, inArray, lte, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import * as base from "./job-queue-base";
import { reportError } from "./error-reporter";

export * from "./job-queue-base";

export type JobType = base.JobType | "post_call_artifact" | "scheduled_report";
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

const CALLER_MANAGED_ENQUEUE_FAILURE_TYPES = new Set<JobType>(["campaign_dial"]);
const STALE_RECOVERY_BATCH = 200;
const legacyRetryBudgetRemaining = sql`coalesce(${schema.jobs.attempts}, 0) < coalesce(${schema.jobs.maxAttempts}, ${base.DEFAULT_MAX_ATTEMPTS})`;
const legacyRunAtDue = (claimTime: Date) =>
  sql`coalesce(${schema.jobs.runAt}, ${claimTime}) <= ${claimTime}`;

export function enforceDurableEnqueueResult(
  opts: Pick<EnqueueOptions, "type">,
  result: base.EnqueueResult,
): base.EnqueueResult {
  if (!result.ok && !CALLER_MANAGED_ENQUEUE_FAILURE_TYPES.has(opts.type)) {
    throw new Error(result.error || `Failed to enqueue ${opts.type} job`);
  }
  return result;
}

export async function enqueue(db: QueueDb, opts: EnqueueOptions): Promise<base.EnqueueResult> {
  const result = await base.enqueue(db, opts as base.EnqueueOptions);
  return enforceDurableEnqueueResult(opts, result);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle rows remain camelCase.
async function claimLegacyFailed(db: QueueDb, typeFilter?: JobType[]): Promise<any | null> {
  return db.transaction(async (tx) => {
    const claimTime = new Date();
    const clauses = [
      eq(schema.jobs.status, "failed"),
      legacyRunAtDue(claimTime),
      legacyRetryBudgetRemaining,
    ];
    if (typeFilter?.length) clauses.push(inArray(schema.jobs.type, typeFilter));

    const [job] = await tx
      .select()
      .from(schema.jobs)
      .where(and(...clauses))
      .orderBy(schema.jobs.runAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;

    const expectedAttempts = Number(job.attempts || 0);
    const [updated] = await tx
      .update(schema.jobs)
      .set({
        status: "running",
        startedAt: claimTime,
        attempts: expectedAttempts + 1,
        updatedAt: claimTime,
      })
      .where(
        and(
          eq(schema.jobs.id, job.id),
          eq(schema.jobs.status, "failed"),
          eq(schema.jobs.attempts, expectedAttempts),
          legacyRunAtDue(claimTime),
          legacyRetryBudgetRemaining,
        ),
      )
      .returning();
    return updated || null;
  }, base.writeTransactionConfig());
}

/** New work is claimed first; rows stranded by the former retry bug are reclaimed afterward. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see claimLegacyFailed above.
export async function claimJob(db: QueueDb, typeFilter?: JobType[]): Promise<any | null> {
  const pending = await base.claimJob(db, typeFilter as base.JobType[] | undefined);
  return pending || claimLegacyFailed(db, typeFilter);
}

export async function claimJobById(
  db: QueueDb,
  jobId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see claimLegacyFailed above.
): Promise<any | null> {
  const pending = await base.claimJobById(db, jobId, userId);
  if (pending) return pending;

  return db.transaction(async (tx) => {
    const claimTime = new Date();
    const [job] = await tx
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, jobId),
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.status, "failed"),
          legacyRunAtDue(claimTime),
          legacyRetryBudgetRemaining,
        ),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;

    const expectedAttempts = Number(job.attempts || 0);
    const [updated] = await tx
      .update(schema.jobs)
      .set({
        status: "running",
        startedAt: claimTime,
        attempts: expectedAttempts + 1,
        updatedAt: claimTime,
      })
      .where(
        and(
          eq(schema.jobs.id, job.id),
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.status, "failed"),
          eq(schema.jobs.attempts, expectedAttempts),
          legacyRunAtDue(claimTime),
          legacyRetryBudgetRemaining,
        ),
      )
      .returning();
    return updated || null;
  }, base.writeTransactionConfig());
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
  const [updated] = await db.transaction(async (tx) =>
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
  const retryDelaySeconds = Math.max(
    base.backoffSeconds(attempts),
    longRunning ? 5 * 60 : 0,
  );

  const [updated] = await db.transaction(async (tx) =>
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
      const expectedAttempts = Number(job.attempts || 0);
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
            eq(schema.jobs.attempts, expectedAttempts),
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
          await failJob(db, job, error instanceof Error ? error.message : String(error));
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
