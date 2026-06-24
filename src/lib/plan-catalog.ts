/** Stripe-backed plan catalog. Backend billing source of truth. */

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
 * - Personal is free to build and test; live work is funded through Conversation Balance.
 * - Business subscriptions buy the operating layer: numbers, routing, shared workspaces,
 *   integrations, and support. Live work remains independently funded.
 * - Historical minute allowances are preserved for existing subscription compatibility but are
 *   no longer used as public acquisition language.
 */
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Legacy Solo Agent",
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
      "Retained for existing subscribers",
      "Conversation Balance is now the personal entry point",
    ],
  },
  {
    id: "personal-plus",
    name: "Legacy Office Assistant",
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
      "Retained for existing subscribers",
      "Conversation Balance is now the personal entry point",
    ],
  },
  {
    id: "business-starter",
    name: "Front Desk",
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
      "Up to 4 assistants and agents",
      "Dedicated numbers for inbound and outbound",
      "Shared inbox and team handoff",
      "CRM and calendar connections",
      "Conversation Balance for live work",
    ],
  },
  {
    id: "starter",
    name: "Sales & Reception",
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
      "Up to 8 assistants and agents",
      "Intelligent routing and department transfers",
      "Outbound campaign templates",
      "Live activity and collaboration",
      "Conversation Balance alongside the platform plan",
    ],
  },
  {
    id: "scale",
    name: "Custom Enterprise",
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
      "Unlimited assistants, agents, and lines",
      "Full CRM deep-sync and custom webhook payloads",
      "Security review, SSO, and compliance audits",
      "Dedicated implementation and SLA support",
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
  if (id === "lite" || id === "business-lite")
    return STRIPE_PLANS.find((plan) => plan.id === "business-starter") || null;
  if (id === "pro" || id === "business-growth")
    return STRIPE_PLANS.find((plan) => plan.id === "starter") || null;
  if (id === "business" || id === "enterprise")
    return STRIPE_PLANS.find((plan) => plan.id === "scale") || null;
  return STRIPE_PLANS.find((plan) => plan.id === id) || null;
}

/** Public API catalog: only sell current business platform plans. */
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
    pricing_model: "platform_plus_conversation_balance" as const,
  }));
}
