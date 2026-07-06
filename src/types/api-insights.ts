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

export interface InsightsTopicCluster {
  topic: string;
  count: number;
  sample_summary?: string;
}

/** GET /api/insights/topics */
export interface InsightsTopicsResponse {
  topics: InsightsTopicCluster[];
  total_analyzed?: number;
  message?: string;
  cached?: boolean;
}

export interface InsightsFailureMode {
  mode: string;
  count: number;
  recommendation?: string;
}

/** GET /api/insights/failure-modes */
export interface InsightsFailureModesResponse {
  failure_modes: InsightsFailureMode[];
  total_analyzed?: number;
  message?: string;
  cached?: boolean;
}
