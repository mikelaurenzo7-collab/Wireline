import { and, eq, inArray, lte } from "drizzle-orm";

import * as schema from "../db/schema";
import * as base from "./job-queue-base";

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

/**
 * Campaign launch owns a state rollback when its first dial job cannot be queued,
 * so that one producer intentionally receives the structured failure result.
 * Every other durable producer must fail loudly: resolving `{ ok: false }` lets
 * callers that only `await enqueue(...)` acknowledge work that was never stored.
 */
const CALLER_MANAGED_ENQUEUE_FAILURE_TYPES = new Set<JobType>(["campaign_dial"]);

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

// Drizzle returns camelCase rows that don't structurally match the legacy snake_case JobRow shape
// (callers already defensively read both forms, e.g. job-worker.ts's jobOwnerId()).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see explanation above.
async function claimLegacyFailed(db: QueueDb, typeFilter?: JobType[]): Promise<any | null> {
  return db.transaction(async (tx) => {
    const clauses = [eq(schema.jobs.status, "failed"), lte(schema.jobs.runAt, new Date())];
    if (typeFilter?.length) clauses.push(inArray(schema.jobs.type, typeFilter));

    const [job] = await tx
      .select()
      .from(schema.jobs)
      .where(and(...clauses))
      .orderBy(schema.jobs.runAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;

    const [updated] = await tx
      .update(schema.jobs)
      .set({
        status: "running",
        startedAt: new Date(),
        attempts: (job.attempts ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id))
      .returning();
    return updated || null;
    // Same explicit READ WRITE declaration the base queue uses: these claim and
    // retry writes run from unscoped cron/worker contexts, where a reused
    // Supavisor backend can otherwise leak a session-level read-only default.
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
    const [job] = await tx
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, jobId),
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.status, "failed"),
          lte(schema.jobs.runAt, new Date()),
        ),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;

    const [updated] = await tx
      .update(schema.jobs)
      .set({
        status: "running",
        startedAt: new Date(),
        attempts: (job.attempts ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id))
      .returning();
    return updated || null;
  }, base.writeTransactionConfig());
}

/**
 * The base queue historically wrote retryable failures as `failed`, while both
 * claim paths only selected `pending`. Keep the original dead-letter behavior,
 * but put non-exhausted work back into the claimable state after its backoff.
 *
 * Artifact/report jobs can legitimately outlive the legacy 30-second sweep race.
 * Give the in-flight operation up to five minutes to persist its result before a
 * later sweep can reclaim the row; the worker also treats a persisted result as
 * idempotent completion.
 */
export async function failJob(
  db: Parameters<typeof base.failJob>[0],
  job: Parameters<typeof base.failJob>[1],
  errorMessage: string,
): Promise<void> {
  const exhausted = (job.attempts || 0) >= (job.maxAttempts || base.DEFAULT_MAX_ATTEMPTS);
  if (exhausted) {
    await base.failJob(db, job, errorMessage);
    return;
  }

  const [row] = await db
    .select({ type: schema.jobs.type })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, job.id))
    .limit(1);
  const longRunning = row?.type === "post_call_artifact" || row?.type === "scheduled_report";
  const retryDelaySeconds = Math.max(
    base.backoffSeconds(job.attempts || 0),
    longRunning ? 5 * 60 : 0,
  );

  // Mirror base.failJob: declare READ WRITE so the retry reschedule cannot be
  // rejected by a leaked session-level read-only default on a pooled backend.
  // Losing this write would strand the row in `running` until the stale-job
  // sweep 30 minutes later.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.jobs)
      .set({
        status: "pending",
        error: errorMessage.slice(0, 2000),
        finishedAt: null,
        runAt: new Date(Date.now() + retryDelaySeconds * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));
  }, base.writeTransactionConfig());
}

export function startWorker(
  db: Parameters<typeof base.startWorker>[0],
  handler: (job: JobRow) => Promise<void>,
  opts: WorkerOptions = {},
): () => void {
  return base.startWorker(
    db,
    (job: base.JobRow) => handler(job as JobRow),
    opts as base.WorkerOptions,
  );
}
