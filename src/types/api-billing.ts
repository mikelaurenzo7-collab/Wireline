/**
 * Client API shapes for /api/billing/* — keep in sync with billing-routes.ts
 * and workspace-usage-snapshot.ts response bodies.
 */
import type { CommunicationChannel, CheckoutAvailability, CapacityTier } from "../lib/plan-catalog";
import type { VoiceCallPolicy } from "../lib/voice-funding-policy";

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
  channel_entitlements?: {
    plan_id: string | null;
    subscription_status: string;
    channels: readonly CommunicationChannel[];
    is_owner: boolean;
  } | null;
  stripe_configured: boolean;
  agent_count: number;
  phone_lines_used: number;
  phone_lines_included: number;
  /** null means the verification lookup was unavailable. */
  email_verified: boolean | null;
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
  runtime_allowance_usd_monthly?: number;
  ai_spend_allowance_usd_monthly?: number;
  overage_per_min_usd: number;
  included_phone_numbers: number;
  included_mailboxes?: number;
  channels?: readonly CommunicationChannel[];
  catalog_family?: "channels" | "legacy" | null;
  capacity_tier?: CapacityTier | null;
  checkout_availability?: CheckoutAvailability;
  extra_agent_price_usd: number | null;
  extra_agent_voice_minutes_monthly: number;
  extra_agent_included_phone_numbers: number;
  extra_agent_configured: boolean;
  features: string[];
  configured: boolean;
  annual_configured: boolean;
  contact_sales: boolean;
  is_free: boolean;
  public: boolean;
  pricing_model: "guaranteed_voice_plus_flexible_runtime" | "channel_package" | "usage";
}

/** GET /api/billing/plans response envelope */
export interface BillingPlansResponse {
  plans: ClientPlan[];
  stripe_configured: boolean;
  /** Platform checkout gates are open; plan/interval and tenant checks still apply. */
  checkout_available: boolean;
  /** "usage" once USAGE_BILLING_ENABLED is on; absent from older servers. */
  billing_model?: "usage" | "plans";
  /** Usage plan checkout is configured end to end. */
  usage_checkout_available?: boolean;
  usage_tiers?: Array<import("../lib/usage-billing-catalog").UsageTierId>;
}

/** GET /api/billing/usage-spend */
export type UsageSpendResponse =
  | { enabled: false }
  | { enabled: true; usage_account: false }
  | {
      enabled: true;
      usage_account: true;
      tier?: import("../lib/usage-billing-catalog").UsageTierId;
      included_work_usd?: number;
      period: string;
      spent_usd: number;
      cap_usd: number;
      pct: number;
      at_cap: boolean;
      headroom_usd: number;
      reconciliation_required?: boolean;
      included_remaining_usd?: number;
      work_usd?: number;
      max_cap_usd: number;
    };

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
  /** Included work is held after its exact invoice funding was fully reversed. */
  paid_allowance_funding_blocked?: boolean;
  current_call_policy: VoiceCallPolicy;
  completion_grace_minutes?: number | null;
  extra_usage_funding: "conversation_balance";
  ai_spend_usd: number;
  ai_spend_limit_usd: number;
  ai_spend_pct: number;
  ai_spend_hard_cap?: boolean;
  ai_tokens_used_today?: number;
  ai_tokens_daily_limit?: number;
  ai_tokens_pct?: number;
  usage_pct: number;
  voice_minutes_cap?: number;
}
