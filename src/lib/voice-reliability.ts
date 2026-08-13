/**
 * Voice reliability aggregator — powers GET /api/insights/voice-reliability.
 */
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { and, eq, gte } from "drizzle-orm";
import {
  TENANT_OBSERVED_COGS_HEADROOM_RATIO,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  planById,
} from "./plan-catalog";
import { isAbnormalHangup } from "./call-reliability-capture";

export { isAbnormalHangup } from "./call-reliability-capture";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil(p * (sorted.length - 1));
  return sorted[Math.min(idx, sorted.length - 1)];
}

export interface VoiceReliabilitySummary {
  windowDays: number;
  totalCalls: number;
  latency: {
    ttftP50Ms: number | null;
    ttftP95Ms: number | null;
    ttfAudioP50Ms: number | null;
    healthy: boolean;
  };
  hangups: {
    abnormalCount: number;
    abnormalRatePct: number;
    byReason: Record<string, number>;
  };
  toolCalls: {
    total: number;
    failed: number;
    successRatePct: number | null;
  };
  escalations: {
    attempted: number;
    succeeded: number;
    successRatePct: number | null;
  };
  webhooks: {
    total: number;
    failures: number;
    failureRatePct: number | null;
  };
  economics: {
    cogsPerMinUsd: number | null;
    estimatedCogsPerMinUsd: number;
    revenuePerMinUsd: number | null;
    grossMarginPct: number | null;
    totalCostUsd: number;
    totalMinutes: number;
  };
  healthy: boolean;
}

export interface VoiceReliabilityTrendPoint {
  date: string;
  totalCalls: number;
  avgTtftMs: number | null;
  p95TtftMs: number | null;
  abnormalHangupRate: number;
  toolCallFailureRate: number;
  webhookFailureRate: number;
  cogsPerMinUsd: number | null;
}

export interface VoiceReliabilityPayload {
  summary: VoiceReliabilitySummary;
  trends: VoiceReliabilityTrendPoint[];
  generatedAt: string;
}

async function resolveRevenuePerMin(userId: string): Promise<number | null> {
  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  const plan = planById(sub?.plan);
  return plan?.overage_per_min_usd ?? null;
}

export async function getVoiceReliabilitySummary(opts: {
  userId: string;
  days?: number;
  demoOnly?: boolean;
}): Promise<VoiceReliabilitySummary> {
  const days = Math.min(opts.days ?? 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const callWhere = and(
    eq(schema.callLogs.userId, opts.userId),
    gte(schema.callLogs.createdAt, since),
    opts.demoOnly ? eq(schema.callLogs.demo, true) : undefined,
  );

  const callRows = await drizzle
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
      cost: schema.callLogs.cost,
      durationSeconds: schema.callLogs.durationSeconds,
      createdAt: schema.callLogs.createdAt,
    })
    .from(schema.callLogs)
    .where(callWhere);

  const webhookRows = await drizzle
    .select({
      outcome: schema.webhookHealth.outcome,
    })
    .from(schema.webhookHealth)
    .where(
      and(eq(schema.webhookHealth.userId, opts.userId), gte(schema.webhookHealth.createdAt, since)),
    );

  const totalCalls = callRows.length;
  const ttfts = callRows
    .map((r) => r.ttftMs)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const ttfas = callRows
    .map((r) => r.ttfAudioMs)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  const ttftP50 = percentile(ttfts, 0.5);
  const ttftP95 = percentile(ttfts, 0.95);
  const ttfAudioP50 = percentile(ttfas, 0.5);

  const hangupByReason: Record<string, number> = {};
  let abnormalHangups = 0;
  for (const row of callRows) {
    const reason = row.endedReason ?? "unknown";
    hangupByReason[reason] = (hangupByReason[reason] ?? 0) + 1;
    if (isAbnormalHangup(row.endedReason)) abnormalHangups++;
  }

  let toolTotal = 0;
  let toolFailed = 0;
  let escalationAttempted = 0;
  let escalationSucceeded = 0;
  let totalCost = 0;
  let totalDurationSec = 0;

  for (const row of callRows) {
    toolTotal += row.toolCallsTotal ?? 0;
    toolFailed += row.toolCallsFailed ?? 0;
    if (row.escalationAttempted) escalationAttempted++;
    if (row.escalationSucceeded) escalationSucceeded++;
    totalCost += Number(row.cost ?? 0);
    totalDurationSec += row.durationSeconds ?? 0;
  }

  const webhookTotal = webhookRows.length;
  const webhookFailures = webhookRows.filter((r) => r.outcome !== "success").length;

  const totalMinutes = totalDurationSec / 60;
  const cogsPerMin = totalMinutes > 0 ? totalCost / totalMinutes : null;
  const revenuePerMin = await resolveRevenuePerMin(opts.userId);
  const grossMarginPct =
    cogsPerMin != null && revenuePerMin != null && revenuePerMin > 0
      ? Math.round(((revenuePerMin - cogsPerMin) / revenuePerMin) * 10000) / 100
      : null;

  const abnormalRatePct = totalCalls ? Math.round((abnormalHangups / totalCalls) * 10000) / 100 : 0;
  const toolSuccessRate =
    toolTotal > 0 ? Math.round(((toolTotal - toolFailed) / toolTotal) * 10000) / 100 : null;
  const escalationSuccessRate =
    escalationAttempted > 0
      ? Math.round((escalationSucceeded / escalationAttempted) * 10000) / 100
      : null;
  const webhookFailureRate =
    webhookTotal > 0 ? Math.round((webhookFailures / webhookTotal) * 10000) / 100 : null;

  const latencyHealthy = ttftP95 == null || ttftP95 <= 1200;
  const hangupHealthy = abnormalRatePct <= 10;
  const toolHealthy = toolSuccessRate == null || toolSuccessRate >= 95;
  const escalationHealthy = escalationSuccessRate == null || escalationSuccessRate >= 90;
  const webhookHealthy = webhookFailureRate == null || webhookFailureRate <= 5;

  return {
    windowDays: days,
    totalCalls,
    latency: {
      ttftP50Ms: ttftP50,
      ttftP95Ms: ttftP95,
      ttfAudioP50Ms: ttfAudioP50,
      healthy: latencyHealthy,
    },
    hangups: {
      abnormalCount: abnormalHangups,
      abnormalRatePct: abnormalRatePct,
      byReason: hangupByReason,
    },
    toolCalls: {
      total: toolTotal,
      failed: toolFailed,
      successRatePct: toolSuccessRate,
    },
    escalations: {
      attempted: escalationAttempted,
      succeeded: escalationSucceeded,
      successRatePct: escalationSuccessRate,
    },
    webhooks: {
      total: webhookTotal,
      failures: webhookFailures,
      failureRatePct: webhookFailureRate,
    },
    economics: {
      cogsPerMinUsd: cogsPerMin != null ? Math.round(cogsPerMin * 10000) / 10000 : null,
      estimatedCogsPerMinUsd: VOICE_VARIABLE_COST_PER_MIN_USD,
      revenuePerMinUsd: revenuePerMin,
      grossMarginPct,
      totalCostUsd: Math.round(totalCost * 100) / 100,
      totalMinutes: Math.round(totalMinutes * 10) / 10,
    },
    healthy:
      latencyHealthy &&
      hangupHealthy &&
      toolHealthy &&
      escalationHealthy &&
      webhookHealthy &&
      // Per-tenant observed rate vs the reserve with variance headroom —
      // the same bound the Insights COGS tile shows, so the summary banner
      // and the tile can never disagree. Catalog-level drift review is
      // tenant-economics' COGS_DRIFT_THRESHOLD_PER_MIN_USD, not this check.
      (cogsPerMin == null ||
        cogsPerMin <= VOICE_VARIABLE_COST_PER_MIN_USD * TENANT_OBSERVED_COGS_HEADROOM_RATIO),
  };
}

export async function getVoiceReliabilityTrends(opts: {
  userId: string;
  days?: number;
  demoOnly?: boolean;
}): Promise<VoiceReliabilityTrendPoint[]> {
  const days = Math.min(opts.days ?? 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const callRows = await drizzle
    .select({
      createdAt: schema.callLogs.createdAt,
      ttftMs: schema.callLogs.ttftMs,
      endedReason: schema.callLogs.endedReason,
      toolCallsTotal: schema.callLogs.toolCallsTotal,
      toolCallsFailed: schema.callLogs.toolCallsFailed,
      cost: schema.callLogs.cost,
      durationSeconds: schema.callLogs.durationSeconds,
    })
    .from(schema.callLogs)
    .where(
      and(
        eq(schema.callLogs.userId, opts.userId),
        gte(schema.callLogs.createdAt, since),
        opts.demoOnly ? eq(schema.callLogs.demo, true) : undefined,
      ),
    );

  const webhookRows = await drizzle
    .select({
      createdAt: schema.webhookHealth.createdAt,
      outcome: schema.webhookHealth.outcome,
    })
    .from(schema.webhookHealth)
    .where(
      and(eq(schema.webhookHealth.userId, opts.userId), gte(schema.webhookHealth.createdAt, since)),
    );

  type Bucket = {
    ttfts: number[];
    total: number;
    abnormal: number;
    toolTotal: number;
    toolFailed: number;
    cost: number;
    durationSec: number;
    webhookTotal: number;
    webhookFailed: number;
  };

  const byDate = new Map<string, Bucket>();

  const bucketFor = (dateKey: string): Bucket => {
    const existing = byDate.get(dateKey);
    if (existing) return existing;
    const fresh: Bucket = {
      ttfts: [],
      total: 0,
      abnormal: 0,
      toolTotal: 0,
      toolFailed: 0,
      cost: 0,
      durationSec: 0,
      webhookTotal: 0,
      webhookFailed: 0,
    };
    byDate.set(dateKey, fresh);
    return fresh;
  };

  for (const row of callRows) {
    if (!row.createdAt) continue;
    const dateKey = row.createdAt.toISOString().slice(0, 10);
    const b = bucketFor(dateKey);
    if (row.ttftMs != null) b.ttfts.push(row.ttftMs);
    b.total++;
    if (isAbnormalHangup(row.endedReason)) b.abnormal++;
    b.toolTotal += row.toolCallsTotal ?? 0;
    b.toolFailed += row.toolCallsFailed ?? 0;
    b.cost += Number(row.cost ?? 0);
    b.durationSec += row.durationSeconds ?? 0;
  }

  for (const row of webhookRows) {
    if (!row.createdAt) continue;
    const dateKey = row.createdAt.toISOString().slice(0, 10);
    const b = bucketFor(dateKey);
    b.webhookTotal++;
    if (row.outcome !== "success") b.webhookFailed++;
  }

  return Array.from(byDate.keys())
    .sort()
    .map((date) => {
      const b = byDate.get(date)!;
      const sorted = b.ttfts.sort((a, c) => a - c);
      const minutes = b.durationSec / 60;
      return {
        date,
        totalCalls: b.total,
        avgTtftMs: sorted.length
          ? Math.round(sorted.reduce((sum, v) => sum + v, 0) / sorted.length)
          : null,
        p95TtftMs: percentile(sorted, 0.95),
        abnormalHangupRate: b.total ? Math.round((b.abnormal / b.total) * 10000) / 100 : 0,
        toolCallFailureRate: b.toolTotal
          ? Math.round((b.toolFailed / b.toolTotal) * 10000) / 100
          : 0,
        webhookFailureRate: b.webhookTotal
          ? Math.round((b.webhookFailed / b.webhookTotal) * 10000) / 100
          : 0,
        cogsPerMinUsd: minutes > 0 ? Math.round((b.cost / minutes) * 10000) / 10000 : null,
      };
    });
}

export async function getVoiceReliabilityPayload(opts: {
  userId: string;
  days?: number;
  demoOnly?: boolean;
}): Promise<VoiceReliabilityPayload> {
  const [summary, trends] = await Promise.all([
    getVoiceReliabilitySummary(opts),
    getVoiceReliabilityTrends(opts),
  ]);
  return {
    summary,
    trends,
    generatedAt: new Date().toISOString(),
  };
}
