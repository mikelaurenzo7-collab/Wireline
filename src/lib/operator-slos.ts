/**
 * Operator-facing SLO snapshot — aggregates queue depth, webhook outcomes,
 * post-call enrichment health, and high-severity audit signals for one tenant.
 * All queries are user_id-scoped; intended for authenticated dashboard use.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getQueueStats, type QueueStats } from "./job-queue";

export type SloHealth = "ok" | "warn" | "critical";

export interface OperatorSloSnapshot {
  window_hours: number;
  evaluated_at: string;
  jobs: {
    queue: QueueStats;
    /** Age in seconds of the oldest still-pending job (any type), or null if none. */
    oldest_pending_age_seconds: number | null;
    enrichment: {
      pending: number;
      running: number;
      failed: number;
      dead: number;
      done_in_window: number;
    };
  };
  webhooks: {
    attempts_in_window: number;
    success_in_window: number;
    terminal_failure_in_window: number;
    pending_retry_now: number;
    success_rate: number | null;
  };
  ai_reliability: {
    claude_calls_in_window: number;
    error_severity_events_in_window: number;
    critical_events_in_window: number;
  };
  /** Per-dimension health derived from thresholds (documented below). */
  dimensions: Record<string, SloHealth>;
  notes: string[];
}

function nextUtcMidnightIso(from = new Date()): string {
  const t = new Date(from);
  t.setUTCHours(24, 0, 0, 0);
  return t.toISOString();
}

const DEFAULT_WINDOW_H = 24;

/** Exported for tests — maps raw counts to coarse health buckets. */
export function evaluateOperatorSloHealth(input: {
  pendingJobs: number;
  deadEnrichmentWindow: number;
  webhookAttemptsWindow: number;
  webhookSuccessRate: number | null;
  auditErrorsWindow: number;
}): Record<string, SloHealth> & { notes: string[] } {
  const notes: string[] = [];
  const jobs_queue: SloHealth =
    input.pendingJobs > 200 ? "critical" : input.pendingJobs > 50 ? "warn" : "ok";
  if (input.pendingJobs > 50) {
    notes.push(
      input.pendingJobs > 200
        ? "Job backlog is very high — confirm cron POST /api/jobs/sweep is scheduled on serverless deployments."
        : "Job backlog elevated — sweep latency may affect enrichment and outbound tasks.",
    );
  }

  const enrichment_failures: SloHealth =
    input.deadEnrichmentWindow > 5 ? "critical" : input.deadEnrichmentWindow > 0 ? "warn" : "ok";

  let webhooks: SloHealth = "ok";
  if (input.webhookAttemptsWindow >= 10) {
    if (input.webhookSuccessRate !== null && input.webhookSuccessRate < 0.85) webhooks = "critical";
    else if (input.webhookSuccessRate !== null && input.webhookSuccessRate < 0.95) webhooks = "warn";
  }

  const ai_errors: SloHealth =
    input.auditErrorsWindow > 50 ? "critical" : input.auditErrorsWindow > 10 ? "warn" : "ok";

  return {
    jobs_queue,
    enrichment_failures,
    webhooks,
    ai_errors,
    notes,
  };
}

export async function getOperatorSloSnapshot(
  db: SupabaseClient,
  userId: string,
  windowHours: number = DEFAULT_WINDOW_H,
): Promise<OperatorSloSnapshot> {
  const now = new Date();
  const sinceIso = new Date(now.getTime() - windowHours * 3_600_000).toISOString();
  const evaluated_at = now.toISOString();

  const queue = await getQueueStats(db, userId);

  const { data: oldestPending } = await db
    .from("wireline_jobs")
    .select("run_at, created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("run_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const oldestRun = oldestPending?.run_at || oldestPending?.created_at;
  const oldest_pending_age_seconds = oldestRun
    ? Math.max(0, Math.floor((now.getTime() - Date.parse(String(oldestRun))) / 1000))
    : null;

  const [enPending, enRunning, enFailed, enDead, enDone] = await Promise.all([
    db
      .from("wireline_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "post_call_enrichment")
      .eq("status", "pending"),
    db
      .from("wireline_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "post_call_enrichment")
      .eq("status", "running"),
    db
      .from("wireline_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "post_call_enrichment")
      .eq("status", "failed"),
    db
      .from("wireline_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "post_call_enrichment")
      .eq("status", "dead"),
    db
      .from("wireline_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "post_call_enrichment")
      .eq("status", "done")
      .gte("finished_at", sinceIso),
  ]);

  const [whSuccess, whFail, whAttempts, whPending] = await Promise.all([
    db
      .from("wireline_webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "success")
      .gte("created_at", sinceIso),
    db
      .from("wireline_webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["failed", "dead"])
      .gte("created_at", sinceIso),
    db
      .from("wireline_webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sinceIso),
    db
      .from("wireline_webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending"),
  ]);

  const success_in_window = whSuccess.count ?? 0;
  const terminal_failure_in_window = whFail.count ?? 0;
  const attempts_in_window = whAttempts.count ?? 0;
  const completed_in_window = success_in_window + terminal_failure_in_window;
  const success_rate = completed_in_window > 0 ? success_in_window / completed_in_window : null;

  const [aiCalls, errSev, critSev] = await Promise.all([
    db
      .from("wireline_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "ai.api_call")
      .eq("provider", "anthropic")
      .gte("created_at", sinceIso),
    db
      .from("wireline_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("severity", ["error", "critical"])
      .gte("created_at", sinceIso),
    db
      .from("wireline_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("severity", "critical")
      .gte("created_at", sinceIso),
  ]);

  const deadEnrichmentWindow = (enDead.count ?? 0) as number;

  const health = evaluateOperatorSloHealth({
    pendingJobs: queue.pending,
    deadEnrichmentWindow,
    webhookAttemptsWindow: attempts_in_window,
    webhookSuccessRate: success_rate,
    auditErrorsWindow: errSev.count ?? 0,
  });

  return {
    window_hours: windowHours,
    evaluated_at,
    jobs: {
      queue,
      oldest_pending_age_seconds,
      enrichment: {
        pending: enPending.count ?? 0,
        running: enRunning.count ?? 0,
        failed: enFailed.count ?? 0,
        dead: enDead.count ?? 0,
        done_in_window: enDone.count ?? 0,
      },
    },
    webhooks: {
      attempts_in_window,
      success_in_window,
      terminal_failure_in_window,
      pending_retry_now: whPending.count ?? 0,
      success_rate,
    },
    ai_reliability: {
      claude_calls_in_window: aiCalls.count ?? 0,
      error_severity_events_in_window: errSev.count ?? 0,
      critical_events_in_window: critSev.count ?? 0,
    },
    dimensions: {
      jobs_queue: health.jobs_queue,
      enrichment_failures: health.enrichment_failures,
      webhooks: health.webhooks,
      ai_errors: health.ai_errors,
    },
    notes: [
      ...health.notes,
      `Quota / daily token reset (UTC): ${nextUtcMidnightIso()}`,
    ],
  };
}
