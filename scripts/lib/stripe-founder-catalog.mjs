/**
 * Canonical Stripe catalog manifest for Founder Early Access.
 *
 * Keep customer-facing plan ids aligned with src/lib/plan-catalog.ts:
 * personal is the free builder and intentionally has no Stripe product.
 * Retired products do not belong in this active reconciliation manifest; their
 * historical ids remain runtime-compatible through dedicated legacy code.
 */
export const FOUNDER_CATALOG_VERSION = "founder_early_access_2026_07_v6";

// The Stripe manifest also retains resolver-compatible products for historical
// subscriptions. This explicit set is the commercial contract exposed to new
// self-serve customers at launch.
export const PUBLIC_SELF_SERVE_PLAN_IDS = ["starter", "team", "business"];

export const FOUNDER_PRODUCTS = [
  {
    key: "starter",
    name: "Wireline Starter",
    description:
      "1 live Voice Bot, 1 production number, 50 voice minutes/month, email + SMS, and no automatic overages.",
    defaultPriceKey: "starter_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "starter",
      wireline_customer_tier: "starter_19",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "1",
      included_numbers: "1",
      included_voice_minutes: "50",
      included_ai_spend_usd: "1.50",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "team",
    name: "Wireline Starter Plus",
    description:
      "2 live Bots, 2 production numbers, 100 pooled voice minutes/month, Lead Hunt, email + SMS, and no automatic overages.",
    defaultPriceKey: "team_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "team",
      wireline_customer_tier: "starter_plus_39",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "2",
      included_numbers: "2",
      included_voice_minutes: "100",
      included_ai_spend_usd: "3",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "business",
    name: "Wireline Pro",
    description:
      "Up to 5 live Bots, 190 pooled voice minutes/month, routing, approvals, CRM, email + SMS, and no automatic overages.",
    defaultPriceKey: "business_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "business",
      wireline_customer_tier: "pro_79",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "5",
      included_numbers: "5",
      included_voice_minutes: "190",
      included_ai_spend_usd: "6",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "enterprise",
    name: "Wireline Business",
    description:
      "Up to 15 live Bots, 350 pooled voice minutes/month, routing, analytics, CRM, email + SMS, and no automatic overages.",
    defaultPriceKey: "enterprise_monthly_founder_2026_07_v6",
    metadata: {
      wireline_plan_id: "enterprise",
      wireline_customer_tier: "business_159",
      wireline_billing_model: "guaranteed_voice_plus_flexible_runtime",
      wireline_catalog_state: "launch_active",
      included_agents: "15",
      included_numbers: "15",
      included_voice_minutes: "350",
      included_ai_spend_usd: "12",
      overage_policy: "prepaid_balance_only",
      wireline_templates: "unlocked",
    },
  },
  {
    key: "scale",
    name: "Wireline Scale & Enterprise",
    description:
      "Custom plan for 25+ Bots with advanced governance, SSO, integrations, retention controls, security review, and implementation support.",
    defaultPriceKey: null,
    metadata: {
      wireline_offer: "enterprise_contact",
      wireline_catalog_state: "launch_active",
    },
  },
  {
    key: "extra_agent",
    name: "Wireline Extra Bot + 50 Minutes",
    description: "+1 live Bot, +1 production-number slot, and +50 guaranteed voice minutes/month.",
    defaultPriceKey: "extra_agent_monthly_founder_2026_07_v3",
    metadata: {
      wireline_addon_id: "extra_agent",
      wireline_catalog_state: "launch_active",
      included_phone_numbers: "1",
      included_voice_minutes: "50",
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
    metadata: {
      wireline_plan_id: "starter",
      included_voice_minutes: "50",
      included_ai_spend_usd: "1.50",
    },
  },
  {
    key: "starter_annual_founder_2026_07_v6",
    productKey: "starter",
    nickname: "Wireline Starter — Founder Annual v6",
    lookupKey: "starter_annual_founder_2026_07_v6",
    unitAmount: 19000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
    metadata: {
      wireline_plan_id: "starter",
      included_voice_minutes: "50",
      included_ai_spend_usd: "1.50",
    },
  },
  {
    key: "team_monthly_founder_2026_07_v6",
    productKey: "team",
    nickname: "Wireline Starter Plus — Founder Monthly v6",
    lookupKey: "team_monthly_founder_2026_07_v6",
    unitAmount: 3900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_PRICE_ID",
    metadata: {
      wireline_plan_id: "team",
      included_voice_minutes: "100",
      included_ai_spend_usd: "3",
    },
  },
  {
    key: "team_annual_founder_2026_07_v6",
    productKey: "team",
    nickname: "Wireline Starter Plus — Founder Annual v6",
    lookupKey: "team_annual_founder_2026_07_v6",
    unitAmount: 39000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    metadata: {
      wireline_plan_id: "team",
      included_voice_minutes: "100",
      included_ai_spend_usd: "3",
    },
  },
  {
    key: "business_monthly_founder_2026_07_v6",
    productKey: "business",
    nickname: "Wireline Pro — Founder Monthly v6",
    lookupKey: "business_monthly_founder_2026_07_v6",
    unitAmount: 7900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_TEAM_PRICE_ID",
    metadata: {
      wireline_plan_id: "business",
      included_voice_minutes: "190",
      included_ai_spend_usd: "6",
    },
  },
  {
    key: "business_annual_founder_2026_07_v6",
    productKey: "business",
    nickname: "Wireline Pro — Founder Annual v6",
    lookupKey: "business_annual_founder_2026_07_v6",
    unitAmount: 79000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    metadata: {
      wireline_plan_id: "business",
      included_voice_minutes: "190",
      included_ai_spend_usd: "6",
    },
  },
  {
    key: "enterprise_monthly_founder_2026_07_v6",
    productKey: "enterprise",
    nickname: "Wireline Business — Founder Monthly v6",
    lookupKey: "enterprise_monthly_founder_2026_07_v6",
    unitAmount: 15900,
    recurring: { interval: "month", usage_type: "licensed" },
    envTarget: "STRIPE_BUSINESS_PRICE_ID",
    metadata: {
      wireline_plan_id: "enterprise",
      included_voice_minutes: "350",
      included_ai_spend_usd: "12",
    },
  },
  {
    key: "enterprise_annual_founder_2026_07_v6",
    productKey: "enterprise",
    nickname: "Wireline Business — Founder Annual v6",
    lookupKey: "enterprise_annual_founder_2026_07_v6",
    unitAmount: 159000,
    recurring: { interval: "year", usage_type: "licensed" },
    envTarget: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    metadata: {
      wireline_plan_id: "enterprise",
      included_voice_minutes: "350",
      included_ai_spend_usd: "12",
    },
  },
  {
    key: "extra_agent_monthly_founder_2026_07_v3",
    productKey: "extra_agent",
    nickname: "Wireline Extra Bot + 50 Minutes — Founder Monthly",
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
