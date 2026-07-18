/**
 * Client API shapes for /api/billing/* — keep in sync with billing-routes.ts
 * and workspace-usage-snapshot.ts response bodies.
 */

export type BillingTrialStatus = "trialing" | "trial_expired" | (string & {});

export interface BillingTrialBlock {
  status: BillingTrialStatus;
  days_left: number | null;
  ends_at: string | null;
  outbound_used: number;
  outbound_cap: number;
  agents_cap: number;
  agents_used: number;
}

export interface BillingSubscriptionState {
  plan: string | null;
  plan_id: string | null;
  plan_name: string | null;
  max_agents: number | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  customer_state?: string | null;
  has_subscription: boolean;
  updated_at: string | null;
}

export interface BillingSignupIntent {
  plan_id: string | null;
  wedge: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

/** GET /api/billing/status */
export interface BillingStatusResponse {
  stripe_configured: boolean;
  agent_count: number;
  phone_lines_used: number;
  phone_lines_included: number;
  email_verified: boolean;
  subscription: BillingSubscriptionState | null;
  trial: BillingTrialBlock | null;
  signup_intent: BillingSignupIntent | null;
}

/** GET /api/billing/plans — plansForClient() payload */
export interface ClientPlan {
  id: string;
  name: string;
  price_usd_monthly: number;
  price_usd_annual: number;
  max_agents: number;
  voice_minutes_monthly: number;
  overage_per_min_usd: number;
  included_phone_numbers: number;
  extra_agent_price_usd: number | null;
  extra_agent_voice_minutes_monthly: number;
  extra_agent_included_phone_numbers: number;
  extra_agent_configured: boolean;
  features: string[];
  configured: boolean;
  annual_configured: boolean;
  contact_sales: boolean;
  public: boolean;
  pricing_model: "guaranteed_voice_plus_flexible_runtime";
}

/** GET /api/billing/plans response envelope */
export interface BillingPlansResponse {
  plans: ClientPlan[];
  stripe_configured: boolean;
}

/** GET /api/billing/usage — mirrors WorkspaceUsageSnapshot */
export interface WorkspaceUsageResponse {
  plan_id: string | null;
  plan_name: string | null;
  voice_minutes_used: number;
  voice_minutes_included: number;
  voice_minutes_remaining: number;
  voice_usage_pct: number;
  overage_minutes: number;
  overage_per_min_usd: number;
  overage_cost_usd: number;
  period_key: string;
  reset_at: string;
  stripe_metered: false;
  credit_balance_usd: number;
  completion_grace_due_usd: number;
  live_voice_blocked: boolean;
  current_call_policy: "finish_current_block_next";
  extra_usage_funding: "conversation_balance";
  ai_spend_usd: number;
  ai_spend_limit_usd: number;
  ai_spend_pct: number;
  ai_spend_hard_cap?: boolean;
  ai_tokens_used_today?: number;
  ai_tokens_daily_limit?: number;
  ai_tokens_pct?: number;
  openrouter_allowed?: boolean;
  usage_pct: number;
  voice_minutes_cap?: number;
}
