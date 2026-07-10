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
