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

import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type JobStatus = "pending" | "running" | "done" | "failed" | "dead";

export type JobType =
  | "post_call_enrichment"   // Async Claude post-call analysis replacing inline call
  | "webhook_delivery"       // Re-use / extend existing webhook retry mechanism
  | "daily_brief"            // Pre-compute operator daily brief
  | "campaign_dial"          // One outbound dial within a campaign
  | "consent_check"          // Pre-call TCPA gateway check
  | "purge_old_data"          // GDPR data-retention TTL purge (nightly, per-tenant)
  | "purge_deleted_account"  // GDPR Phase 1.5 — hard-delete account after 30-day grace
  | "google_drive_ingest"    // Sync documents via Gemini
  | "adaptive_optimization"  // Auto-tune agent from low-scoring calls
  | "v2a_action_extraction"  // Voice-to-Action: extract action items from a call transcript
  | "execute_action"         // Execute an extracted action via the Action Engine
  | "calendar_sync";         // Sync Google/Outlook calendars

export interface JobPayload extends Record<string, unknown> {}

export interface JobRow {
  id: string;
  user_id: string;
  type: JobType;
  payload: JobPayload;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: string;        // ISO — when the job is eligible to be picked up
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
  runAt?: Date;            // Default: now (run immediately)
  maxAttempts?: number;    // Default: DEFAULT_MAX_ATTEMPTS
}

export interface EnqueueResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}

export async function enqueue(
  db: SupabaseClient,
  opts: EnqueueOptions,
): Promise<EnqueueResult> {
  const runAt = opts.runAt ?? new Date();
  const { data, error } = await db
    .from("wireline_jobs")
    .insert({
      user_id: opts.userId,
      type: opts.type,
      payload: opts.payload,
      status: "pending" as JobStatus,
      attempts: 0,
      max_attempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      run_at: runAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, jobId: (data as { id: string }).id };
}

// ─────────────────────────────────────────────────────────────────
// Consumer — claim one pending job (atomic)
// ─────────────────────────────────────────────────────────────────

/**
 * Attempt to atomically claim one pending job via RPC.
 * The RPC (`wireline_claim_job`) does:
 *   UPDATE wireline_jobs SET status='running', started_at=now(),
 *          attempts=attempts+1, updated_at=now()
 *   WHERE id = (
 *     SELECT id FROM wireline_jobs
 *     WHERE status='pending' AND run_at <= now()
 *     ORDER BY run_at ASC
 *     LIMIT 1
 *     FOR UPDATE SKIP LOCKED
 *   )
 *   RETURNING *
 *
 * Returns the claimed job row, or null when the queue is idle.
 * Falls back to a non-atomic select+update on older deployments where
 * the RPC doesn't exist yet — safe for single-worker setups.
 */
export async function claimJob(
  db: SupabaseClient,
  typeFilter?: JobType[],
): Promise<JobRow | null> {
  // Try atomic RPC first
  try {
    const { data, error } = await db.rpc("wireline_claim_job", {
      p_types: typeFilter ?? null,
    });
    if (!error && data) return data as JobRow;
  } catch {
    // RPC not available — fall through
  }

  // Non-atomic fallback: best-effort for low-concurrency deployments
  const q = db
    .from("wireline_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(1);
  if (typeFilter?.length) {
    // `in` filter — Supabase PostgREST: col=in.(a,b,c)
    q.in("type", typeFilter);
  }
  const { data } = await q;
  if (!data || (data as JobRow[]).length === 0) return null;
  const job = (data as JobRow[])[0];

  const { error: ue } = await db
    .from("wireline_jobs")
    .update({
      status: "running" as JobStatus,
      started_at: new Date().toISOString(),
      attempts: (job.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "pending"); // guard against double-claim
  if (ue) return null; // lost the race — another worker claimed it
  return { ...job, status: "running", attempts: job.attempts + 1 };
}

// ─────────────────────────────────────────────────────────────────
// Completion helpers
// ─────────────────────────────────────────────────────────────────

export async function completeJob(db: SupabaseClient, jobId: string): Promise<void> {
  await db.from("wireline_jobs").update({
    status: "done" as JobStatus,
    finished_at: new Date().toISOString(),
    error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);
}

export async function failJob(
  db: SupabaseClient,
  job: Pick<JobRow, "id" | "attempts" | "max_attempts">,
  errorMessage: string,
): Promise<void> {
  const exhausted = job.attempts >= job.max_attempts;
  const nextRunAt = exhausted
    ? null
    : new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString();

  await db.from("wireline_jobs").update({
    status: (exhausted ? "dead" : "failed") as JobStatus,
    error: errorMessage.slice(0, 2000),
    finished_at: exhausted ? new Date().toISOString() : null,
    run_at: nextRunAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
}

// ─────────────────────────────────────────────────────────────────
// Worker loop
// ─────────────────────────────────────────────────────────────────

export type JobHandler = (job: JobRow) => Promise<void>;

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
export function startWorker(
  db: SupabaseClient,
  handler: JobHandler,
  opts: WorkerOptions = {},
): () => void {
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
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await failJob(db, job, msg);
        }
      }
    } catch (err: unknown) {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
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

export async function getQueueStats(db: SupabaseClient, userId?: string): Promise<QueueStats> {
  const anHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const scoped = <T extends { eq: (col: string, val: string) => T }>(q: T): T =>
    userId ? q.eq("user_id", userId) : q;
  const [pending, running, failed, dead, done] = await Promise.all([
    scoped(db.from("wireline_jobs").select("id", { count: "exact", head: true }).eq("status", "pending") as any),
    scoped(db.from("wireline_jobs").select("id", { count: "exact", head: true }).eq("status", "running") as any),
    scoped(db.from("wireline_jobs").select("id", { count: "exact", head: true }).eq("status", "failed") as any),
    scoped(db.from("wireline_jobs").select("id", { count: "exact", head: true }).eq("status", "dead") as any),
    scoped(db.from("wireline_jobs").select("id", { count: "exact", head: true })
      .eq("status", "done").gte("finished_at", anHourAgo) as any),
  ]);
  return {
    pending:       pending.count ?? 0,
    running:       running.count ?? 0,
    failed:        failed.count ?? 0,
    dead:          dead.count ?? 0,
    done_last_hour: done.count ?? 0,
  };
}
