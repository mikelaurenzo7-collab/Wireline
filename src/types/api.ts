/**
 * Shared TypeScript interfaces for Wireline API response shapes.
 *
 * Every fetch from /api/* should be typed against one of these shapes.
 * Components can import only the types they need — tree-shaking keeps
 * this file from affecting bundle size.
 */

export type {
  BillingPlansResponse,
  BillingSignupIntent,
  BillingStatusResponse,
  BillingSubscriptionState,
  BillingTrialBlock,
  BillingTrialStatus,
  ClientPlan,
  WorkspaceUsageResponse,
} from "./api-billing";

export type {
  AuditSummary,
  InsightsFunnelResponse,
  InsightsFunnelStage,
  InsightsQaStatsResponse,
  InsightsTopicRow,
  InsightsTopicsResponse,
  VoiceLatencyInsightsResponse,
  VoiceLatencyRecentCallRow,
  VoiceLatencyTrendPoint,
  VoiceReliabilityResponse,
  VoiceReliabilitySummaryResponse,
  VoiceReliabilityTrendPointResponse,
} from "./api-insights";
