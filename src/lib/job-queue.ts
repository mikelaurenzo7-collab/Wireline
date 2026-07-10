import { eq } from "drizzle-orm";

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

export async function enqueue(
  db: Parameters<typeof base.enqueue>[0],
  opts: EnqueueOptions,
): Promise<base.EnqueueResult> {
  return base.enqueue(db, opts as base.EnqueueOptions);
}

/**
 * The base queue historically wrote retryable failures as `failed`, while both
 * claim paths only select `pending`. Keep the original dead-letter behavior, but
 * put non-exhausted work back into the claimable state after its backoff.
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

  await db
    .update(schema.jobs)
    .set({
      status: "pending",
      error: errorMessage.slice(0, 2000),
      finishedAt: null,
      runAt: new Date(Date.now() + retryDelaySeconds * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, job.id));
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
