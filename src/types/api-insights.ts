/**
 * Client API shapes for /api/insights/* — keep in sync with insights-routes.ts.
 */

export interface InsightsFunnelStage {
  name: string;
  count: number;
}

/** GET /api/insights/funnel */
export interface InsightsFunnelResponse {
  window_days: number;
  stages: InsightsFunnelStage[];
}

/** GET /api/insights/leaderboard */
export interface InsightsLeaderboardAgentRow {
  agent_id: string;
  agent_name: string;
  archetype: string | null;
  role: string;
  channel: string | null;
  total_calls: number;
  qualified: number;
  high_intent: number;
  bookings: number;
  avg_lead_score: number;
  minutes: number;
  cost: number;
  ai_cost: number;
  total_cost: number;
  cost_per_qualified: number;
  cost_per_outcome: number;
  conversion_rate: number;
  rank_delta?: number | null;
}

export interface InsightsLeaderboardResponse {
  window_days: number;
  agents: InsightsLeaderboardAgentRow[];
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
}

export interface InsightsFailureModeRow {
  failure_type: string;
  severity: "critical" | "high" | "medium" | "low";
  fix_target: string;
  count: number;
  description: string;
  recommended_fix: string;
  label?: string;
  failure?: string;
  id?: string;
}

/** GET /api/insights/failure-modes */
export interface InsightsFailureModesResponse {
  modes: InsightsFailureModeRow[];
  message?: string;
  cached?: boolean;
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
  economics: {
    cogsPerMinUsd: number | null;
    estimatedCogsPerMinUsd: number;
    revenuePerMinUsd: number | null;
    grossMarginPct: number | null;
    totalCostUsd: number;
    totalMinutes: number;
  };
}

export interface VoiceReliabilityTrendPointResponse {
  date: string;
  totalCalls: number;
  avgTtftMs: number | null;
  p95TtftMs: number | null;
  abnormalHangupRate: number;
  toolCallFailureRate: number;
  webhookFailureRate: number;
  cogsPerMinUsd: number | null;
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
}

export interface InsightsAttributionRow {
  source: string;
  calls: number;
  total_seconds: number;
  booked: number;
  qualified: number;
}

/** GET /api/insights/campaign-attribution */
export interface InsightsAttributionResponse {
  days: number;
  attribution: InsightsAttributionRow[];
}

export interface InsightsHeatmapCell {
  weekday: number;
  hour: number;
  count: number;
  avg_score: number;
}

/** GET /api/insights/heatmap */
export interface InsightsHeatmapResponse {
  window_days: number;
  grid: InsightsHeatmapCell[];
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
  generated_at: string;
}

export type { AuditSummary } from "../lib/audit-summary";
