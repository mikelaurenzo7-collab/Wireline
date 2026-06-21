import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import * as schema from "../db/schema";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { getQueueStats, type QueueStats } from "./job-queue";
import type { WebhookEvent } from "./webhook-helpers";

export type SloHealth = "ok" | "warn" | "critical";

export interface AccountHolderSloSnapshot {
  window_hours: number;
  evaluated_at: string;
  jobs: {
    queue: QueueStats;
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
  dimensions: Record<string, SloHealth>;
  fired_events: SloWebhookPayload[];
  notes: string[];
}

function nextUtcMidnightIso(from = new Date()): string {
  const t = new Date(from);
  t.setUTCHours(24, 0, 0, 0);
  return t.toISOString();
}

const DEFAULT_WINDOW_H = 24;

export function evaluateAccountHolderSloHealth(input: {
  pendingJobs: number;
  deadEnrichmentWindow: number;
  webhookAttemptsWindow: number;
  webhookSuccessRate: number | null;
  auditErrorsWindow: number;
}): {
  jobs_queue: SloHealth;
  enrichment_failures: SloHealth;
  webhooks: SloHealth;
  ai_errors: SloHealth;
  notes: string[];
} {
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
    else if (input.webhookSuccessRate !== null && input.webhookSuccessRate < 0.95)
      webhooks = "warn";
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

export interface SloWebhookPayload {
  event: WebhookEvent;
  dimension: string;
  health: SloHealth;
  summary: string;
  window_hours: number;
  evaluated_at: string;
}

export function getSloWebhookEvents(
  dimensions: Record<string, SloHealth>,
  windowHours: number,
  evaluatedAt: string,
): SloWebhookPayload[] {
  const payloads: SloWebhookPayload[] = [];

  if (dimensions.jobs_queue === "critical") {
    payloads.push({
      event: "slo.jobs.critical",
      dimension: "jobs_queue",
      health: "critical",
      summary: "Job queue backlog has exceeded the critical threshold (>200 pending).",
      window_hours: windowHours,
      evaluated_at: evaluatedAt,
    });
  }

  if (dimensions.webhooks === "critical" || dimensions.webhooks === "warn") {
    payloads.push({
      event: "slo.webhooks.degraded",
      dimension: "webhooks",
      health: dimensions.webhooks,
      summary:
        dimensions.webhooks === "critical"
          ? "Webhook success rate has dropped below 85%."
          : "Webhook success rate has dropped below 95%.",
      window_hours: windowHours,
      evaluated_at: evaluatedAt,
    });
  }

  if (dimensions.enrichment_failures === "critical") {
    payloads.push({
      event: "slo.enrichment.dead",
      dimension: "enrichment_failures",
      health: "critical",
      summary:
        "More than 5 post-call enrichment jobs reached dead-letter status in the current window.",
      window_hours: windowHours,
      evaluated_at: evaluatedAt,
    });
  }

  return payloads;
}

export async function getAccountHolderSloSnapshot(
  drizzle: VercelPgDatabase<typeof schema>,
  userId: string,
  windowHours: number = DEFAULT_WINDOW_H,
): Promise<AccountHolderSloSnapshot> {
  const now = new Date();
  const since = new Date(now.getTime() - windowHours * 3_600_000);
  const evaluated_at = now.toISOString();

  const queue = await getQueueStats(drizzle, userId);

  const [oldestPending] = await drizzle
    .select({ runAt: schema.jobs.runAt, createdAt: schema.jobs.createdAt })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.status, "pending")))
    .orderBy(schema.jobs.runAt)
    .limit(1);

  const oldestRun = oldestPending?.runAt || oldestPending?.createdAt;
  const oldest_pending_age_seconds = oldestRun
    ? Math.max(0, Math.floor((now.getTime() - new Date(oldestRun).getTime()) / 1000))
    : null;

  const [
    enPendingRes,
    enRunningRes,
    enFailedRes,
    enDeadRes,
    enDoneRes,
    whSuccessRes,
    whFailRes,
    whAttemptsRes,
    whPendingRes,
    aiCallsRes,
    errSevRes,
    critSevRes,
  ] = await Promise.all([
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, "post_call_enrichment"),
          eq(schema.jobs.status, "pending"),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, "post_call_enrichment"),
          eq(schema.jobs.status, "running"),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, "post_call_enrichment"),
          eq(schema.jobs.status, "failed"),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, "post_call_enrichment"),
          eq(schema.jobs.status, "dead"),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, "post_call_enrichment"),
          eq(schema.jobs.status, "done"),
          gte(schema.jobs.finishedAt, since),
        ),
      ),

    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.webhookDeliveries)
      .where(
        and(
          eq(schema.webhookDeliveries.userId, userId),
          eq(schema.webhookDeliveries.status, "success"),
          gte(schema.webhookDeliveries.createdAt, since),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.webhookDeliveries)
      .where(
        and(
          eq(schema.webhookDeliveries.userId, userId),
          inArray(schema.webhookDeliveries.status, ["failed", "dead"]),
          gte(schema.webhookDeliveries.createdAt, since),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.webhookDeliveries)
      .where(
        and(
          eq(schema.webhookDeliveries.userId, userId),
          gte(schema.webhookDeliveries.createdAt, since),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.webhookDeliveries)
      .where(
        and(
          eq(schema.webhookDeliveries.userId, userId),
          eq(schema.webhookDeliveries.status, "pending"),
        ),
      ),

    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, userId),
          eq(schema.auditLog.eventType, "ai.api_call"),
          eq(schema.auditLog.provider, "anthropic"),
          gte(schema.auditLog.createdAt, since),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, userId),
          inArray(schema.auditLog.severity, ["error", "critical"]),
          gte(schema.auditLog.createdAt, since),
        ),
      ),
    drizzle
      .select({ count: sql`count(*)` })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, userId),
          eq(schema.auditLog.severity, "critical"),
          gte(schema.auditLog.createdAt, since),
        ),
      ),
  ]);

  const enPending = Number(enPendingRes[0].count);
  const enRunning = Number(enRunningRes[0].count);
  const enFailed = Number(enFailedRes[0].count);
  const enDead = Number(enDeadRes[0].count);
  const enDone = Number(enDoneRes[0].count);

  const success_in_window = Number(whSuccessRes[0].count);
  const terminal_failure_in_window = Number(whFailRes[0].count);
  const attempts_in_window = Number(whAttemptsRes[0].count);
  const whPending = Number(whPendingRes[0].count);

  const completed_in_window = success_in_window + terminal_failure_in_window;
  const success_rate = completed_in_window > 0 ? success_in_window / completed_in_window : null;

  const aiCalls = Number(aiCallsRes[0].count);
  const errSev = Number(errSevRes[0].count);
  const critSev = Number(critSevRes[0].count);

  const health = evaluateAccountHolderSloHealth({
    pendingJobs: queue.pending,
    deadEnrichmentWindow: enDead,
    webhookAttemptsWindow: attempts_in_window,
    webhookSuccessRate: success_rate,
    auditErrorsWindow: errSev,
  });

  return {
    window_hours: windowHours,
    evaluated_at,
    jobs: {
      queue,
      oldest_pending_age_seconds,
      enrichment: {
        pending: enPending,
        running: enRunning,
        failed: enFailed,
        dead: enDead,
        done_in_window: enDone,
      },
    },
    webhooks: {
      attempts_in_window,
      success_in_window,
      terminal_failure_in_window,
      pending_retry_now: whPending,
      success_rate,
    },
    ai_reliability: {
      claude_calls_in_window: aiCalls,
      error_severity_events_in_window: errSev,
      critical_events_in_window: critSev,
    },
    dimensions: {
      jobs_queue: health.jobs_queue,
      enrichment_failures: health.enrichment_failures,
      webhooks: health.webhooks,
      ai_errors: health.ai_errors,
    },
    fired_events: getSloWebhookEvents(
      {
        jobs_queue: health.jobs_queue,
        enrichment_failures: health.enrichment_failures,
        webhooks: health.webhooks,
        ai_errors: health.ai_errors,
      },
      windowHours,
      evaluated_at,
    ),
    notes: [...health.notes, `Quota / daily token reset (UTC): ${nextUtcMidnightIso()}`],
  };
}
