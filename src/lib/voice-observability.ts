/**
 * Voice observability — per-call metrics tracking and demo line health alerting.
 *
 * Tracks:
 *   - TTFT (time-to-first-token): target <900ms, alert threshold 1.2s p95
 *   - STT/TTS error rates per call
 *   - Full pipeline latency (time-to-first-audio)
 *
 * Demo line health:
 *   - p95 TTFT over 5min window → alert
 *   - Error rate >5% over 5min → alert
 */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { dispatchWebhook } from "./webhook-helpers";
import { isAbnormalHangup, isPipelineFailure } from "./call-reliability-capture";

export interface VoiceMetricsPayload {
  vapiCallId: string;
  ttftMs?: number;
  ttfAudioMs?: number;
  sttError?: boolean;
  ttsError?: boolean;
  pipelineError?: "stt" | "tts" | "llm" | "connection" | "unknown" | null;
  latencyP50Ms?: number;
  latencyP95Ms?: number;
}

/**
 * Record per-call voice telemetry. Called from webhook handlers when
 * call-end or provider-status events arrive.
 */
export async function recordVoiceMetrics(
  userId: string,
  payload: VoiceMetricsPayload,
): Promise<void> {
  try {
    await drizzle
      .update(schema.callLogs)
      .set({
        ttftMs: payload.ttftMs ?? null,
        ttfAudioMs: payload.ttfAudioMs ?? null,
        sttError: payload.sttError ?? false,
        ttsError: payload.ttsError ?? false,
        pipelineError: payload.pipelineError ?? null,
        latencyP50Ms: payload.latencyP50Ms ?? null,
        latencyP95Ms: payload.latencyP95Ms ?? null,
      })
      .where(eq(schema.callLogs.vapiCallId, payload.vapiCallId));
  } catch (err) {
    log.warn("recordVoiceMetrics failed", {
      userId,
      vapiCallId: payload.vapiCallId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface HealthWindowResult {
  windowMinutes: number;
  totalCalls: number;
  ttftP95Ms: number | null;
  ttftP50Ms: number | null;
  sttErrorRate: number;
  ttsErrorRate: number;
  pipelineErrorRate: number;
  abnormalHangupRate: number;
  toolCallFailureRate: number;
  webhookFailureRate: number;
  escalationFailureRate: number;
  healthy: boolean;
}

const DEFAULT_TTFT_ALERT_MS = 1200; // p95 >1.2s triggers alert
const DEFAULT_ERROR_RATE_ALERT_PCT = 5; // >5% error rate triggers alert
const DEFAULT_HANGUP_RATE_ALERT_PCT = 10;
const DEFAULT_TOOL_FAILURE_RATE_ALERT_PCT = 5;
const DEFAULT_WEBHOOK_FAILURE_RATE_ALERT_PCT = 5;
const DEFAULT_ESCALATION_FAILURE_RATE_ALERT_PCT = 10;

export { isPipelineFailure } from "./call-reliability-capture";

/**
 * Compute health metrics over a trailing window. Used by:
 *   - /api/health/voice-status (public demo line probe)
 *   - Canary cron (alerts when demo line degrades)
 */
export async function computeVoiceHealthWindow(opts: {
  userId?: string; // undefined = all demo calls across tenants
  demoOnly?: boolean;
  windowMinutes?: number;
}): Promise<HealthWindowResult> {
  const windowMinutes = opts.windowMinutes ?? 5;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const baseWhere = and(
    gte(schema.callLogs.createdAt, since),
    opts.demoOnly ? eq(schema.callLogs.demo, true) : undefined,
    opts.userId ? eq(schema.callLogs.userId, opts.userId) : undefined,
  );

  const rows = await drizzle
    .select({
      ttftMs: schema.callLogs.ttftMs,
      ttfAudioMs: schema.callLogs.ttfAudioMs,
      sttError: schema.callLogs.sttError,
      ttsError: schema.callLogs.ttsError,
      pipelineError: schema.callLogs.pipelineError,
      endedReason: schema.callLogs.endedReason,
      toolCallsTotal: schema.callLogs.toolCallsTotal,
      toolCallsFailed: schema.callLogs.toolCallsFailed,
      escalationAttempted: schema.callLogs.escalationAttempted,
      escalationSucceeded: schema.callLogs.escalationSucceeded,
    })
    .from(schema.callLogs)
    .where(baseWhere);

  const webhookWhere = and(
    gte(schema.webhookHealth.createdAt, since),
    opts.userId ? eq(schema.webhookHealth.userId, opts.userId) : undefined,
  );
  const webhookRows = await drizzle
    .select({ outcome: schema.webhookHealth.outcome })
    .from(schema.webhookHealth)
    .where(webhookWhere);

  const total = rows.length;
  if (total === 0) {
    return {
      windowMinutes,
      totalCalls: 0,
      ttftP95Ms: null,
      ttftP50Ms: null,
      sttErrorRate: 0,
      ttsErrorRate: 0,
      pipelineErrorRate: 0,
      abnormalHangupRate: 0,
      toolCallFailureRate: 0,
      webhookFailureRate: 0,
      escalationFailureRate: 0,
      healthy: true, // No data is not a failure; absence of signal ≠ signal of absence
    };
  }

  const ttfts = rows
    .map((r) => r.ttftMs)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const ttftP50 = percentile(ttfts, 0.5);
  const ttftP95 = percentile(ttfts, 0.95);

  const sttErrors = rows.filter((r) => r.sttError).length;
  const ttsErrors = rows.filter((r) => r.ttsError).length;
  const pipelineErrors = rows.filter((r) => isPipelineFailure(r.pipelineError)).length;
  const abnormalHangups = rows.filter((r) => isAbnormalHangup(r.endedReason)).length;

  let toolTotal = 0;
  let toolFailed = 0;
  let escalationAttempted = 0;
  let escalationFailed = 0;
  for (const row of rows) {
    toolTotal += row.toolCallsTotal ?? 0;
    toolFailed += row.toolCallsFailed ?? 0;
    if (row.escalationAttempted) {
      escalationAttempted++;
      if (!row.escalationSucceeded) escalationFailed++;
    }
  }

  const webhookTotal = webhookRows.length;
  const webhookFailed = webhookRows.filter((r) => r.outcome !== "success").length;

  const sttRate = (sttErrors / total) * 100;
  const ttsRate = (ttsErrors / total) * 100;
  const pipelineRate = (pipelineErrors / total) * 100;
  const hangupRate = (abnormalHangups / total) * 100;
  const toolFailureRate = toolTotal > 0 ? (toolFailed / toolTotal) * 100 : 0;
  const webhookFailureRate = webhookTotal > 0 ? (webhookFailed / webhookTotal) * 100 : 0;
  const escalationFailureRate =
    escalationAttempted > 0 ? (escalationFailed / escalationAttempted) * 100 : 0;

  const healthy =
    (ttftP95 == null || ttftP95 <= DEFAULT_TTFT_ALERT_MS) &&
    sttRate <= DEFAULT_ERROR_RATE_ALERT_PCT &&
    ttsRate <= DEFAULT_ERROR_RATE_ALERT_PCT &&
    pipelineRate <= DEFAULT_ERROR_RATE_ALERT_PCT &&
    hangupRate <= DEFAULT_HANGUP_RATE_ALERT_PCT &&
    (toolTotal === 0 || toolFailureRate <= DEFAULT_TOOL_FAILURE_RATE_ALERT_PCT) &&
    (webhookTotal === 0 || webhookFailureRate <= DEFAULT_WEBHOOK_FAILURE_RATE_ALERT_PCT) &&
    (escalationAttempted === 0 ||
      escalationFailureRate <= DEFAULT_ESCALATION_FAILURE_RATE_ALERT_PCT);

  return {
    windowMinutes,
    totalCalls: total,
    ttftP95Ms: ttftP95,
    ttftP50Ms: ttftP50,
    sttErrorRate: Math.round(sttRate * 100) / 100,
    ttsErrorRate: Math.round(ttsRate * 100) / 100,
    pipelineErrorRate: Math.round(pipelineRate * 100) / 100,
    abnormalHangupRate: Math.round(hangupRate * 100) / 100,
    toolCallFailureRate: Math.round(toolFailureRate * 100) / 100,
    webhookFailureRate: Math.round(webhookFailureRate * 100) / 100,
    escalationFailureRate: Math.round(escalationFailureRate * 100) / 100,
    healthy,
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil(p * (sorted.length - 1));
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Alerting integration — called by canary cron or health probe when
 * thresholds are breached. Dispatches webhook + logs for PagerDuty/Opsgenion routing.
 */
export async function alertOnVoiceDegradation(opts: {
  window: HealthWindowResult;
  channel: "demo-line" | string;
  userId?: string;
}): Promise<void> {
  const { window, channel, userId } = opts;
  log.error("Voice degradation alert", {
    channel,
    userId,
    ttftP95Ms: window.ttftP95Ms,
    sttErrorRate: window.sttErrorRate,
    ttsErrorRate: window.ttsErrorRate,
    pipelineErrorRate: window.pipelineErrorRate,
    abnormalHangupRate: window.abnormalHangupRate,
    toolCallFailureRate: window.toolCallFailureRate,
    webhookFailureRate: window.webhookFailureRate,
    escalationFailureRate: window.escalationFailureRate,
    healthy: window.healthy,
  });

  if (userId) {
    await dispatchWebhook(userId, "voice.degradation", {
      channel,
      healthy: window.healthy,
      ttft_p95_ms: window.ttftP95Ms,
      stt_error_rate: window.sttErrorRate,
      tts_error_rate: window.ttsErrorRate,
      pipeline_error_rate: window.pipelineErrorRate,
      abnormal_hangup_rate: window.abnormalHangupRate,
      tool_call_failure_rate: window.toolCallFailureRate,
      webhook_failure_rate: window.webhookFailureRate,
      escalation_failure_rate: window.escalationFailureRate,
      window_minutes: window.windowMinutes,
      total_calls: window.totalCalls,
      at: new Date().toISOString(),
    }).catch(() => {});
  }
}

/**
 * Recent latency trends for Insights Latency tab.
 */
export async function getLatencyTrends(opts: {
  userId: string;
  days?: number;
}): Promise<
  { date: string; avgTtftMs: number | null; p95TtftMs: number | null; errorRate: number }[]
> {
  const days = Math.min(opts.days ?? 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await drizzle
    .select({
      createdAt: schema.callLogs.createdAt,
      ttftMs: schema.callLogs.ttftMs,
      sttError: schema.callLogs.sttError,
      ttsError: schema.callLogs.ttsError,
    })
    .from(schema.callLogs)
    .where(and(eq(schema.callLogs.userId, opts.userId), gte(schema.callLogs.createdAt, since)))
    .orderBy(desc(schema.callLogs.createdAt));

  // Bucket by date (YYYY-MM-DD)
  const byDate = new Map<string, { ttfts: number[]; errors: number; total: number }>();

  for (const r of rows) {
    if (!r.createdAt) continue;
    const dateKey = r.createdAt.toISOString().slice(0, 10);
    const bucket = byDate.get(dateKey) ?? { ttfts: [], errors: 0, total: 0 };
    if (r.ttftMs != null) bucket.ttfts.push(r.ttftMs);
    if (r.sttError || r.ttsError) bucket.errors++;
    bucket.total++;
    byDate.set(dateKey, bucket);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  return sortedDates.map((d) => {
    const b = byDate.get(d)!;
    const sorted = b.ttfts.sort((a, b) => a - b);
    return {
      date: d,
      avgTtftMs: sorted.length
        ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
        : null,
      p95TtftMs: percentile(sorted, 0.95),
      errorRate: b.total ? Math.round((b.errors / b.total) * 10000) / 100 : 0,
    };
  });
}
