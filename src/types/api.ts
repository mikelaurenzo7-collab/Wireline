/**
 * Shared TypeScript interfaces for Wireline API response shapes.
 *
 * Every fetch from /api/* should be typed against one of these shapes.
 * Components can import only the types they need — tree-shaking keeps
 * this file from affecting bundle size.
 */

/* ── Agents ──────────────────────────────────────────────────────── */

export interface Agent {
  id: string;
  name: string;
  archetype: string;
  role?: string;
  channel?: "voice" | "email" | "omnichannel";
  first_message?: string;
  website_url?: string | null;
  kpi_focus?: string;
  created_at: string;
}

/* ── Call logs ───────────────────────────────────────────────────── */

export interface CallLog {
  id: string;
  vapi_call_id?: string;
  agent_id: string;
  agent_name?: string | null; // Agent name from JOIN - optional for backwards compatibility
  user_id?: string;
  direction: "inbound" | "outbound";
  customer_number: string | null;
  duration_seconds: number;
  cost: number;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  lead_score: number | null;
  intent_label: "low" | "medium" | "high" | "escalation" | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  coaching_note: string | null;
  qa_score?: number | null;
  outcome_tag?: string | null;
  pipeline_error?: string | null;
  campaign_source?: string | null;
  created_at: string;
}

/* ── Training Flywheel & Outcomes (Wireline MOAT #1) ──────────────── */
/** Structured suggestion extracted from conversation outcomes for the training flywheel. */
export interface TrainingSuggestion {
  id: string;
  kind: "fact" | "directive" | "personality" | "tool";
  content: string;
  sourceOutcomeId?: string;
  confidence?: number; // 0-1
  agentId: string;
}

/** Unified view over call/sms/email outcomes for the ledger (extends existing CallLog). */
export interface OutcomeRecord extends CallLog {
  channel?: "voice" | "sms" | "email";
  next_steps?: string | null;
}

/* ── Dashboard stats ─────────────────────────────────────────────── */

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

export interface WeekDelta {
  calls_pct?: number;
  score_pct?: number;
  cost_pct?: number;
}

export interface ChartDataPoint {
  name: string;
  signals: number;
  leads: number;
}

export interface DashboardStats {
  totalCalls: number;
  inboundCount: number;
  outboundCount: number;
  totalMinutes: number;
  avgLeadScore: number | null;
  conversionRate: number;
  totalCost: string;
  agents: Agent[];
  recentLogs: CallLog[];
  hotLeads: HotLead[];
  chartData: ChartDataPoint[];
  sentimentBreakdown: SentimentBreakdown;
  week_delta: WeekDelta;
}

/* ── Hot leads (from /api/dashboard/stats and /api/triage) ──────── */

export interface HotLead {
  id: string;
  agent_id: string;
  customer_number: string | null;
  lead_score: number;
  intent_label: string | null;
  summary: string | null;
  created_at: string;
  /** Populated in dashboard stats only */
  type?: "call" | "email";
  /** Populated in dashboard stats only */
  contact?: string;
  score?: number;
}

/* ── Assistants tasks ─────────────────────────────────────────────────── */

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface FollowUpTask {
  id: string;
  user_id?: string;
  agent_id: string | null;
  task_type: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  target_channel: string | null;
  source_type?: string | null;
  source_id?: string | null;
  resolution_notes?: string | null;
  due_date?: string | null;
  created_at: string;
}

/* ── Signal presence (live calls) ───────────────────────────────── */

export interface SignalPresence {
  id: string;
  agent_id: string;
  user_id?: string;
  customer_number: string | null;
  status: string;
  label?: string | null;
  created_at: string;
}

/* ── Assistants presence response ─────────────────────────────────────── */

export interface AssistantPresenceResponse {
  signals: SignalPresence[];
}

/* ── Assistants tasks response ────────────────────────────────────────── */

export interface FollowUpTasksResponse {
  tasks: FollowUpTask[];
}

/* ── Assistants activity ──────────────────────────────────────────────── */

export interface ActivityItem {
  id: string;
  type: "SIGNAL_ANALYZED" | "MISSION_INJECTED" | "NEURAL_OPTIMIZATION" | "DIGITAL_RELAY";
  trigger: string;
  action: string;
  meta: string;
  timestamp: string;
  importance: "critical" | "high" | "medium" | "low";
}

export interface AssistantActivityResponse {
  activity: ActivityItem[];
}

/* ── Triage ──────────────────────────────────────────────────────── */

export interface TriageKnowledgeGap {
  id: string;
  agent_id: string;
  lesson: string;
  created_at: string;
}

export interface TriageEscalation {
  id: string;
  agent_id: string;
  customer_number: string | null;
  lead_score: number | null;
  summary: string | null;
  created_at: string;
}

export interface TriageData {
  hot_leads: HotLead[];
  compliance: FollowUpTask[];
  pending_tasks: FollowUpTask[];
  knowledge_gaps: TriageKnowledgeGap[];
  escalations: TriageEscalation[];
  counts: Record<string, number>;
}

/* ── Nav badge counts ────────────────────────────────────────────── */

export interface NavCounts {
  "/call-logs": number;
  "/ops": number;
  "/inbox": number;
  "/outbound": number;
  "/live": number;
}

/* ── Knowledge base ──────────────────────────────────────────────── */

export interface KnowledgeEntry {
  id: string;
  agent_id: string;
  user_id?: string;
  content: string;
  created_at: string;
}

/* ── Appointments ────────────────────────────────────────────────── */

export type AppointmentStatus = "Scheduled" | "Completed" | "Cancelled" | "Rescheduled";

export interface Appointment {
  id: string;
  user_id?: string;
  agent_id?: string | null;
  customer_number: string | null;
  customer_name?: string | null;
  title: string;
  description?: string | null;
  scheduled_at: string;
  duration_minutes?: number;
  status: AppointmentStatus;
  source_call_id?: string | null;
  created_at: string;
}

/* ── Outbound campaigns ──────────────────────────────────────────── */

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Campaign {
  id: string;
  user_id?: string;
  name: string;
  agent_id: string;
  status: CampaignStatus;
  total_leads?: number;
  dialed?: number;
  connected?: number;
  qualified?: number;
  created_at: string;
}

/* ── Outbound leads ──────────────────────────────────────────────── */

export type LeadStatus = "queued" | "dialing" | "connected" | "completed" | "failed" | "dnc";

export interface OutboundLead {
  id: string;
  campaign_id?: string | null;
  user_id?: string;
  agent_id?: string | null;
  customer_name?: string | null;
  phone: string;
  context?: string | null;
  status: LeadStatus;
  attempts?: number;
  lead_score?: number | null;
  notes?: string | null;
  created_at: string;
}

/* ── Billing ─────────────────────────────────────────────────────── */

export interface SubscriptionInfo {
  status: "active" | "trialing" | "past_due" | "cancelled" | "incomplete";
  current_period_end?: string | null;
  plan?: string | null;
}

export interface BillingStatus {
  subscription: SubscriptionInfo | null;
  customer_id?: string | null;
}

/* ── QA / scoring ────────────────────────────────────────────────── */

export interface QaStats {
  avgScore: number;
  totalScored: number;
  trend: Array<{ date: string; avg: number }>;
  byAgent: Array<{ agent_id: string; agent_name: string; avg: number; count: number }>;
}

/* ── Agent scorecard ─────────────────────────────────────────────── */

export type MetricFormat = "percent" | "number" | "seconds" | "score";

export interface ScorecardPrimary {
  label: string;
  value: number;
  format: MetricFormat;
  delta_pct: number;
  trend: number[];
}

export interface ScorecardSecondary {
  label: string;
  value: number;
  format: MetricFormat;
}

export interface AgentScorecard {
  kpi_focus: string;
  window_days: number;
  primary: ScorecardPrimary;
  secondary: ScorecardSecondary[];
  sample_size: number;
}

/* ── Agent performance ───────────────────────────────────────────── */

export interface AgentPerformance {
  callCount: number;
  avgScore: number | null;
  totalMinutes: number;
  sentimentBreakdown: SentimentBreakdown;
  sparkline: number[];
}

/* ── Insights ────────────────────────────────────────────────────── */

export interface FunnelData {
  totalCalls: number;
  connected: number;
  qualified: number;
  highIntent: number;
  bookings: number;
  completed: number;
  queuedLeads: number;
}

export interface HeatmapCell {
  hour: number;
  day: number;
  count: number;
}

export interface LeaderboardEntry {
  agent_id: string;
  agent_name: string;
  call_count: number;
  avg_score: number | null;
  avg_duration: number;
}

/* ── Email ───────────────────────────────────────────────────────── */

export interface EmailAccount {
  id: string;
  email: string;
  provider: "google" | "microsoft";
  auto_respond: boolean;
  created_at: string;
}

export interface EmailThread {
  id: string;
  account_id: string;
  customer_email: string | null;
  subject: string | null;
  snippet: string | null;
  lead_score: number | null;
  intent_label: string | null;
  read: boolean;
  created_at: string;
}

/* ── DNC ─────────────────────────────────────────────────────────── */

export interface DncEntry {
  id: string;
  phone: string;
  phone_raw?: string;
  reason?: string | null;
  source?: string | null;
  created_at: string;
}

/* ── Webhooks ────────────────────────────────────────────────────── */

export type WebhookEvent =
  | "call.completed"
  | "call.started"
  | "lead.qualified"
  | "appointment.booked"
  | "email.received"
  | "email.replied"
  | "task.created";

export interface Webhook {
  id: string;
  user_id?: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  created_at: string;
}

/* ── Audit ───────────────────────────────────────────────────────── */

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditEvent {
  id: string;
  user_id?: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: Record<string, unknown> | null;
  severity: AuditSeverity;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

/* ── Phone numbers ───────────────────────────────────────────────── */

export interface PhoneNumber {
  id: string | number;
  number: string;
  vapi_phone_number_id?: string | null;
  label?: string | null;
  created_at?: string;
}

/* ── Settings ────────────────────────────────────────────────────── */

export interface UserSettings {
  vapi_phone_number_id: string;
  subscription_status: string;
  max_agents: number;
  voice_llm_provider: string;
  voice_llm_model: string;
}

/* ── Spend cap ───────────────────────────────────────────────────── */

export interface SpendBudget {
  monthly_budget_usd: number;
  daily_limit_usd: number;
  accumulated_usd: number;
}

export interface SpendStatus {
  accumulated_usd: number;
  daily_limit_usd: number;
  monthly_budget_usd: number;
  within_budget: boolean;
}

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
