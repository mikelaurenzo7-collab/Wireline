/** Stripe-backed plan catalog. Internal ids remain transitional while public copy moves to Personal, Team, Business, and Enterprise. */

/** Blended variable voice cost reserve used for pricing guardrails. */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;

export type StripePlanId = "personal" | "personal-plus" | "business-starter" | "starter" | "scale";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  /** Internal transitional quota data. It is not a public pricing promise. */
  voice_minutes_monthly: number;
  overage_per_min_usd: number;
  included_phone_numbers: number;
  features: string[];
  priceIdEnv: string;
  extra_agent_price_usd?: number;
  extraAgentPriceIdEnv?: string;
  price_usd_annual: number;
  annualPriceIdEnv: string;
  overagePriceIdEnv?: string;
  /** Retained for existing subscribers but not offered as a public acquisition plan. */
  public?: boolean;
};

/**
 * Commercial contract:
 * - Templates are not plan locks. Every customer can start from any agent template.
 * - Plans sell the operating layer: agents, numbers, routing, collaboration,
 *   integrations, support, and reliability.
 * - Personal remains top-up-led through Conversation Balance.
 * - Historical minute allowances are preserved for compatibility but are not public promises.
 */
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Legacy Wireline Personal",
    price_usd_monthly: 7,
    max_agents: 1,
    voice_minutes_monthly: 60,
    overage_per_min_usd: 0.2,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    extra_agent_price_usd: 7,
    extraAgentPriceIdEnv: "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 67,
    annualPriceIdEnv: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PERSONAL_OVERAGE_PRICE_ID",
    public: false,
    features: [
      "Legacy personal subscription",
      "Retained only for backwards compatibility",
      "Conversation Balance is the active personal funding model",
    ],
  },
  {
    id: "personal-plus",
    name: "Legacy Wireline Plus",
    price_usd_monthly: 15,
    max_agents: 2,
    voice_minutes_monthly: 180,
    overage_per_min_usd: 0.18,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_PERSONAL_PLUS_PRICE_ID",
    extra_agent_price_usd: 7,
    extraAgentPriceIdEnv: "STRIPE_PERSONAL_PLUS_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 144,
    annualPriceIdEnv: "STRIPE_PERSONAL_PLUS_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PERSONAL_PLUS_OVERAGE_PRICE_ID",
    public: false,
    features: [
      "Legacy personal subscription",
      "Retained only for backwards compatibility",
      "Do not position this as an active acquisition tier",
    ],
  },
  {
    id: "business-starter",
    name: "Wireline Team",
    price_usd_monthly: 29,
    max_agents: 4,
    voice_minutes_monthly: 500,
    overage_per_min_usd: 0.16,
    included_phone_numbers: 2,
    priceIdEnv: "STRIPE_BUSINESS_STARTER_PRICE_ID",
    extra_agent_price_usd: 9,
    extraAgentPriceIdEnv: "STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 278,
    annualPriceIdEnv: "STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID",
    features: [
      "Shared operating capacity for a small team",
      "Several active agents with one inbox",
      "Routing, approvals, and connected numbers",
      "Core integrations and follow-up controls",
      "Conversation Balance alongside shared operations",
    ],
  },
  {
    id: "starter",
    name: "Wireline Business",
    price_usd_monthly: 59,
    max_agents: 8,
    voice_minutes_monthly: 1_200,
    overage_per_min_usd: 0.14,
    included_phone_numbers: 4,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    extra_agent_price_usd: 12,
    extraAgentPriceIdEnv: "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 566,
    annualPriceIdEnv: "STRIPE_PRO_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PRO_OVERAGE_PRICE_ID",
    features: [
      "Operating capacity for revenue and support teams",
      "Shared routing, approvals, and analytics",
      "CRM sync, policies, and role-aware controls",
      "Outbound, inbound, and follow-up in one workspace",
      "Conversation Balance pooled with the platform plan",
    ],
  },
  {
    id: "scale",
    name: "Wireline Enterprise",
    price_usd_monthly: 0,
    max_agents: 999,
    voice_minutes_monthly: 0,
    overage_per_min_usd: 0,
    included_phone_numbers: 0,
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    extra_agent_price_usd: 0,
    extraAgentPriceIdEnv: "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 0,
    annualPriceIdEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_BUSINESS_OVERAGE_PRICE_ID",
    features: [
      "Annual committed usage and rollout planning",
      "SSO, audit support, and governed policy controls",
      "Custom integrations, telephony, and implementation support",
      "Enterprise approvals, reporting, and security review",
    ],
  },
];

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return (
    STRIPE_PLANS.find(
      (plan) =>
        process.env[plan.priceIdEnv] === priceId ||
        process.env[plan.annualPriceIdEnv] === priceId ||
        (plan.extraAgentPriceIdEnv ? process.env[plan.extraAgentPriceIdEnv] === priceId : false) ||
        (plan.overagePriceIdEnv ? process.env[plan.overagePriceIdEnv] === priceId : false),
    ) || null
  );
}

export function planById(id: string | null | undefined): StripePlan | null {
  if (!id) return null;
  if (id === "team" || id === "lite" || id === "business-lite")
    return STRIPE_PLANS.find((plan) => plan.id === "business-starter") || null;
  if (id === "business" || id === "pro" || id === "business-growth")
    return STRIPE_PLANS.find((plan) => plan.id === "starter") || null;
  if (id === "enterprise" || id === "custom")
    return STRIPE_PLANS.find((plan) => plan.id === "scale") || null;
  return STRIPE_PLANS.find((plan) => plan.id === id) || null;
}

/** Public API catalog: Personal is top-up-led; recurring checkout is for shared capacity tiers. */
export function plansForClient() {
  return STRIPE_PLANS.filter((plan) => plan.public !== false).map((plan) => ({
    id: plan.id,
    name: plan.name,
    price_usd_monthly: plan.price_usd_monthly,
    price_usd_annual: plan.price_usd_annual,
    max_agents: plan.max_agents,
    included_phone_numbers: plan.included_phone_numbers,
    extra_agent_price_usd: plan.extra_agent_price_usd ?? null,
    features: plan.features,
    configured: !!process.env[plan.priceIdEnv],
    annual_configured: !!process.env[plan.annualPriceIdEnv],
    contact_sales: plan.price_usd_monthly === 0,
    public: true,
    pricing_model: "capacity_plus_conversation_balance" as const,
  }));
}
