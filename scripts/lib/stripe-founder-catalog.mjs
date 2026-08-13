/**
 * Canonical Stripe catalog manifest for Founder Early Access.
 *
 * Keep customer-facing plan ids aligned with src/lib/plan-catalog.ts:
 * personal is the free builder and intentionally has no Stripe product.
 */
export const FOUNDER_CATALOG_VERSION = "founder_early_access_2026_07_v6";

export const FOUNDER_PRODUCTS = [
  {
    key: "starter",
    name: "Wireline Starter",
    description:
      "1 live voice agent, 1 production number, 60 voice minutes/month, email + SMS, and no automatic overages.",
    defaultPriceKey: "starter_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "starter",
      wireline_customer_tier: "starter_19",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "1",
      included_numbers: "1",
      included_voice_minutes: "60",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "team",
    name: "Wireline Starter Plus",
    description:
      "2 live agents, 2 production numbers, 120 pooled voice minutes/month, Lead Hunt, email + SMS, and no automatic overages.",
    defaultPriceKey: "team_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "team",
      wireline_customer_tier: "starter_plus_39",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "2",
      included_numbers: "2",
      included_voice_minutes: "120",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "business",
    name: "Wireline Pro",
    description:
      "Up to 5 live voice agents, 245 pooled voice minutes/month, routing, approvals, CRM, email + SMS, and no automatic overages.",
    defaultPriceKey: "business_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "business",
      wireline_customer_tier: "pro_79",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "5",
      included_numbers: "5",
      included_voice_minutes: "245",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "enterprise",
    name: "Wireline Business",
    description:
      "Up to 15 live voice agents, 450 pooled voice minutes/month, routing, analytics, CRM, email + SMS, and no automatic overages.",
    defaultPriceKey: "enterprise_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "enterprise",
      wireline_customer_tier: "business_159",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "15",
      included_numbers: "15",
      included_voice_minutes: "450",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "scale",
    name: "Wireline Scale & Enterprise",
    description:
      "Custom plan for 25+ agents with advanced governance, SSO, integrations, retention controls, security review, and implementation support.",
    defaultPriceKey: null,
    metadata: {
      wireline_offer: "enterprise_contact",
      wireline_catalog_state: "launch_active",
    },
  },
  {
    key: "extra_agent",
    name: "Wireline Extra Agent + 50 Minutes",
    description:
      "+1 live voice agent, +1 production-number slot, and +50 guaranteed voice minutes/month.",
    defaultPriceKey: "extra_agent_monthly_founder_2026_07_v3",
    metadata: {
      wireline_addon_id: "extra_agent",
      wireline_catalog_state: "launch_active",
      included_phone_numbers: "1",
      included_voice_minutes: "50",
    },
  },
  {
    key: "live_video",
    name: "Wireline Live Video",
    description:
      "Live Video for a paid business agent: 60 reserved minutes/month in up-to-5-minute sessions, with no automatic overage.",
    defaultPriceKey: "live_video_monthly",
    metadata: {
      wireline_product: "live_video_addon",
      wireline_billing_model: "addon_subscription",
      wireline_catalog_state: "launch_active",
      included_live_video_minutes: "60",
      session_reservation_minutes: "5",
      overage_policy: "none_pause_at_limit",
    },
  },
  {
    key: "conversation_balance",
    name: "Runtime Balance",
    description:
      "Prepaid Runtime Balance for usage beyond included capacity. No automatic overages.",
    defaultPriceKey: "balance_25",
    metadata: {
      wireline_offer: "conversation_balance",
      wireline_price_type: "conversation_balance",
      wireline_billing_model: "one_time_top_up",
      wireline_catalog_state: "launch_active",
    },
  },
];

export const FOUNDER_PRICES = [
  {
    key: "starter_monthly_founder_2026_07_v6",
    productKey: "starter",
    nickname: "Wireline Starter — Founder Monthly v6",
    lookupKey: "starter_monthly_founder_2026_07_v6",
    unitAmount: 1900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_9_PRICE_ID",
    metadata: { wireline_plan_id: "starter", included_voice_minutes: "60" },
  },
  {
    key: "starter_annual_founder_2026_07_v6",
    productKey: "starter",
    nickname: "Wireline Starter — Founder Annual v6",
    lookupKey: "starter_annual_founder_2026_07_v6",
    unitAmount: 19000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "starter", included_voice_minutes: "60" },
  },
  {
    key: "team_monthly_founder_2026_07_v6",
    productKey: "team",
    nickname: "Wireline Starter Plus — Founder Monthly v6",
    lookupKey: "team_monthly_founder_2026_07_v6",
    unitAmount: 3900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_PRICE_ID",
    metadata: { wireline_plan_id: "team", included_voice_minutes: "120" },
  },
  {
    key: "team_annual_founder_2026_07_v6",
    productKey: "team",
    nickname: "Wireline Starter Plus — Founder Annual v6",
    lookupKey: "team_annual_founder_2026_07_v6",
    unitAmount: 39000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "team", included_voice_minutes: "120" },
  },
  {
    key: "business_monthly_founder_2026_07_v6",
    productKey: "business",
    nickname: "Wireline Pro — Founder Monthly v6",
    lookupKey: "business_monthly_founder_2026_07_v6",
    unitAmount: 7900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_TEAM_PRICE_ID",
    metadata: { wireline_plan_id: "business", included_voice_minutes: "245" },
  },
  {
    key: "business_annual_founder_2026_07_v6",
    productKey: "business",
    nickname: "Wireline Pro — Founder Annual v6",
    lookupKey: "business_annual_founder_2026_07_v6",
    unitAmount: 79000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "business", included_voice_minutes: "245" },
  },
  {
    key: "enterprise_monthly_founder_2026_07_v6",
    productKey: "enterprise",
    nickname: "Wireline Business — Founder Monthly v6",
    lookupKey: "enterprise_monthly_founder_2026_07_v6",
    unitAmount: 15900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_BUSINESS_PRICE_ID",
    metadata: { wireline_plan_id: "enterprise", included_voice_minutes: "450" },
  },
  {
    key: "enterprise_annual_founder_2026_07_v6",
    productKey: "enterprise",
    nickname: "Wireline Business — Founder Annual v6",
    lookupKey: "enterprise_annual_founder_2026_07_v6",
    unitAmount: 159000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "enterprise", included_voice_minutes: "450" },
  },
  {
    key: "extra_agent_monthly_founder_2026_07_v3",
    productKey: "extra_agent",
    nickname: "Wireline Extra Agent + 50 Minutes — Founder Monthly",
    lookupKey: "extra_agent_monthly_founder_2026_07_v3",
    unitAmount: 1500,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_EXTRA_AGENT_PRICE_ID",
    metadata: {
      wireline_addon_id: "extra_agent",
      included_voice_minutes: "50",
      included_phone_numbers: "1",
    },
  },
  {
    key: "live_video_monthly",
    productKey: "live_video",
    nickname: "Live Video Add-on - Monthly",
    lookupKey: "live_video_monthly",
    unitAmount: 1900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
    metadata: {
      wireline_product: "live_video_addon",
      wireline_price_type: "live_video_addon",
      wireline_catalog_state: "launch_active",
      included_live_video_minutes: "60",
      session_reservation_minutes: "5",
      overage_policy: "none_pause_at_limit",
    },
  },
  // Keep in lockstep with src/lib/conversation-balance.ts presets ($10 minimum).
  ...[10, 25, 50, 100].map((amount) => ({
    key: `balance_${amount}`,
    productKey: "conversation_balance",
    nickname: `Runtime Balance - $${amount}`,
    lookupKey: null,
    unitAmount: amount * 100,
    recurring: null,
    envTarget: null,
    metadata: {
      wireline_price_type: "conversation_balance_top_up",
      wireline_amount_usd: String(amount),
    },
  })),
];

export const PRODUCT_BY_KEY = new Map(FOUNDER_PRODUCTS.map((product) => [product.key, product]));
