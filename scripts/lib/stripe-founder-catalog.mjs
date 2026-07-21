/**
 * Canonical Stripe catalog manifest for Founder Early Access.
 *
 * Keep customer-facing plan ids aligned with src/lib/plan-catalog.ts:
 * personal is the free builder and intentionally has no Stripe product.
 */
export const FOUNDER_CATALOG_VERSION = "founder_early_access_2026_07_v4";

export const FOUNDER_PRODUCTS = [
  {
    key: "starter",
    name: "Wireline Starter",
    description:
      "Founder plan for one live AI communications agent: 1 on-demand production number, 20 pooled voice minutes monthly, Lead Hunt access, connected email workflows, and prepaid Conversation Balance for additional usage.",
    defaultPriceKey: "starter_monthly_founder_2026_07_v2",
    metadata: {
      wireline_plan_id: "starter",
      wireline_customer_tier: "starter_9",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "1",
      included_numbers: "1",
      included_voice_minutes: "20",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "team",
    name: "Wireline Starter Plus",
    description:
      "Expanded one-agent founder plan: 1 on-demand production number, 40 pooled voice minutes monthly, full Lead Hunt workflows, shared conversation inbox, connected email and SMS automation, and prepaid Conversation Balance for additional usage.",
    defaultPriceKey: "team_monthly_founder_2026_07_v2",
    metadata: {
      wireline_plan_id: "team",
      wireline_customer_tier: "starter_plus_19",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "1",
      included_numbers: "1",
      included_voice_minutes: "40",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "business",
    name: "Wireline Pro",
    description:
      "Multi-agent operating plan for growing businesses: up to 5 live AI communications agents and on-demand numbers, 100 pooled voice minutes monthly, Lead Hunt workflows, shared inbox, routing, approvals, connected email and SMS automation, and prepaid overflow.",
    defaultPriceKey: "business_monthly_founder_2026_07_v2",
    metadata: {
      wireline_plan_id: "business",
      wireline_customer_tier: "pro_59",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "5",
      included_numbers: "5",
      included_voice_minutes: "100",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "enterprise",
    name: "Wireline Business",
    description:
      "High-capacity operating plan: up to 15 live AI communications agents and on-demand numbers, 250 pooled voice minutes monthly, Lead Hunt and enrichment workflows, analytics, CRM controls, approvals, connected email and SMS automation, and prepaid overflow.",
    defaultPriceKey: "enterprise_monthly_founder_2026_07_v2",
    metadata: {
      wireline_plan_id: "enterprise",
      wireline_customer_tier: "business_149",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "15",
      included_numbers: "15",
      included_voice_minutes: "250",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "scale",
    name: "Wireline Scale & Enterprise",
    description:
      "Custom committed-usage plan for 25 or more AI communications agents, advanced governance, SSO, custom telephony and integrations, retention controls, security review, implementation support, and negotiated channel economics.",
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
      "Adds one live Wireline agent, one production-number slot, and 50 additional guaranteed voice minutes each month.",
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
    description: "Photoreal presenter streaming add-on for business agents.",
    defaultPriceKey: "live_video_monthly",
    metadata: {
      wireline_product: "live_video_addon",
      wireline_billing_model: "addon_subscription",
      wireline_catalog_state: "launch_active",
    },
  },
  {
    key: "conversation_balance",
    name: "Conversation Balance",
    description:
      "One-time prepaid balance for live calls, texts, follow-up, and provider-backed work.",
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
    key: "starter_monthly_founder_2026_07_v2",
    productKey: "starter",
    nickname: "Wireline Starter — Founder Monthly",
    lookupKey: "starter_monthly_founder_2026_07_v2",
    unitAmount: 900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_9_PRICE_ID",
    metadata: { wireline_plan_id: "starter", included_voice_minutes: "20" },
  },
  {
    key: "starter_annual_founder_2026_07_v3",
    productKey: "starter",
    nickname: "Wireline Starter — Founder Annual",
    lookupKey: "starter_annual_founder_2026_07_v3",
    unitAmount: 9900,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "starter", included_voice_minutes: "20" },
  },
  {
    key: "team_monthly_founder_2026_07_v2",
    productKey: "team",
    nickname: "Wireline Starter Plus — Founder Monthly",
    lookupKey: "team_monthly_founder_2026_07_v2",
    unitAmount: 1900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_PRICE_ID",
    metadata: { wireline_plan_id: "team", included_voice_minutes: "40" },
  },
  {
    key: "team_annual_founder_2026_07_v2",
    productKey: "team",
    nickname: "Wireline Starter Plus — Founder Annual",
    lookupKey: "team_annual_founder_2026_07_v2",
    unitAmount: 19000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "team", included_voice_minutes: "40" },
  },
  {
    key: "business_monthly_founder_2026_07_v2",
    productKey: "business",
    nickname: "Wireline Pro — Founder Monthly",
    lookupKey: "business_monthly_founder_2026_07_v2",
    unitAmount: 5900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_TEAM_PRICE_ID",
    metadata: { wireline_plan_id: "business", included_voice_minutes: "100" },
  },
  {
    key: "business_annual_founder_2026_07_v2",
    productKey: "business",
    nickname: "Wireline Pro — Founder Annual",
    lookupKey: "business_annual_founder_2026_07_v2",
    unitAmount: 59000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "business", included_voice_minutes: "100" },
  },
  {
    key: "enterprise_monthly_founder_2026_07_v2",
    productKey: "enterprise",
    nickname: "Wireline Business — Founder Monthly",
    lookupKey: "enterprise_monthly_founder_2026_07_v2",
    unitAmount: 14900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_BUSINESS_PRICE_ID",
    metadata: { wireline_plan_id: "enterprise", included_voice_minutes: "250" },
  },
  {
    key: "enterprise_annual_founder_2026_07_v2",
    productKey: "enterprise",
    nickname: "Wireline Business — Founder Annual",
    lookupKey: "enterprise_annual_founder_2026_07_v2",
    unitAmount: 149000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    metadata: { wireline_plan_id: "enterprise", included_voice_minutes: "250" },
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
    },
  },
  ...[5, 10, 25, 50].map((amount) => ({
    key: `balance_${amount}`,
    productKey: "conversation_balance",
    nickname: `Conversation Balance - $${amount}`,
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
