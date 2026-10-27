/**
 * Client API shapes for /api/insights/* — keep in sync with insights-routes.ts.
 */

import type { CallOutcome } from "../lib/call-outcome";

export interface InsightsFunnelStage {
  name: string;
  count: number;
}

/** GET /api/insights/funnel */
export interface InsightsFunnelResponse {
  window_days: number;
  stages: InsightsFunnelStage[];
}

export interface InsightsTopicRow {
  name: string;
  count: number;
  category: string;
  trend?: "growing" | "new" | "steady" | "declining";
  example_quote?: string;
  label?: string;
  topic?: string;
  id?: string;
}

/** GET /api/insights/topics */
export interface InsightsTopicsResponse {
  topics: InsightsTopicRow[];
  total_analyzed?: number;
  message?: string;
  cached?: boolean;
  /** True while a cold cluster is computed in the background (see topics route). */
  pending?: boolean;
}

export interface VoiceReliabilitySummaryResponse {
  windowDays: number;
  totalCalls: number;
  healthy: boolean;
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
  /** Counts per shared call outcome (src/lib/call-outcome) — the same
   *  categories the Calls list labels, so the two surfaces reconcile. */
  outcomes: Record<CallOutcome, number>;
}

export interface VoiceReliabilityTrendPointResponse {
  date: string;
  totalCalls: number;
  avgTtftMs: number | null;
  p95TtftMs: number | null;
  abnormalHangupRate: number;
  toolCallFailureRate: number;
  webhookFailureRate: number;
}

/** GET /api/insights/voice-reliability */
export interface VoiceReliabilityResponse {
  summary: VoiceReliabilitySummaryResponse;
  trends: VoiceReliabilityTrendPointResponse[];
  generatedAt: string;
}

export interface VoiceLatencyRecentCallRow {
  id: bigint | number | string;
  vapiCallId: string | null;
  createdAt: string;
  durationSeconds: number | null;
  ttftMs: number | null;
  ttfAudioMs: number | null;
  sttError: boolean | null;
  ttsError: boolean | null;
  pipelineError: string | null;
  sentiment: string | null;
  outcomeTag: string | null;
  /** Shared outcome from src/lib/call-outcome; same label as Call History. */
  outcome?: CallOutcome | null;
}

export interface InsightsQaDimensionAverages {
  greeting?: number;
  discovery?: number;
  solution?: number;
  objection?: number;
  closing?: number;
}

export interface InsightsQaDistributionBucket {
  label: string;
  count: number;
  color?: string;
}

export interface InsightsQaTrendPoint {
  day: string;
  avg: number;
}

/** GET /api/qa/stats */
export interface InsightsQaStatsResponse {
  count: number;
  avgScore: number;
  dimensions?: InsightsQaDimensionAverages;
  distribution?: InsightsQaDistributionBucket[];
  trend?: InsightsQaTrendPoint[];
}

export interface VoiceLatencyTrendPoint {
  date: string;
  avgTtftMs: number | null;
  p95TtftMs: number | null;
  errorRate: number;
}

/** GET /api/insights/latency */
export interface VoiceLatencyInsightsResponse {
  days: number;
  trends: VoiceLatencyTrendPoint[];
  /** Resolved deployment policy; optional for older API responses. */
  max_call_seconds?: number;
  generated_at: string;
}

export type { AuditSummary } from "../lib/audit-summary";
