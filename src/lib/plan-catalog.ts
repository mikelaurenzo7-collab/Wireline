/** Stripe-backed plan catalog. Backend billing source of truth. */

/** Blended variable voice cost reserve used for pricing guardrails. */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;

export type StripePlanId = "personal" | "personal-plus" | "business-starter" | "starter" | "scale";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  max_agents: number;
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
 * Launch catalog principles:
 * - Personal is intentionally light-use, not an unlimited calling bundle.
 * - Business starts with clear coverage and grows through add-on assistants.
 * - Usage allowances reserve room for voice, model, carrier, support, and payment costs.
 */
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Everyday",
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
    features: [
      "1 AI call assistant",
      "1 dedicated Wireline number",
      "60 voice minutes each month",
      "Call summaries and follow-up queue",
      "Web, mobile, Siri, and widget access",
      "Add assistants for $7 / month",
      "Overage at $0.20 / minute",
    ],
  },
  {
    id: "personal-plus",
    name: "Plus",
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
    features: [
      "2 personal assistants",
      "180 voice minutes each month",
      "Calendar and email context",
      "Priority memory and follow-up queue",
      "Add assistants for $7 / month",
      "Overage at $0.18 / minute",
    ],
  },
  {
    id: "business-starter",
    name: "Studio",
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
      "4 assistants and 2 dedicated numbers",
      "500 voice minutes each month",
      "Full Studio for instructions, routing, memory, and handoffs",
      "Calendar, SMS, email, and contact workflows",
      "Works for personal projects or a small business",
      "Add assistants for $9 / month",
      "Overage at $0.16 / minute",
    ],
  },
  {
    id: "starter",
    name: "Operator",
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
      "8 assistants and 4 dedicated numbers",
      "1,200 voice minutes each month",
      "Call review, analytics, and outbound workflows",
      "Outbound calling with email and SMS follow-up",
      "Team collaboration and escalation controls",
      "Add assistants for $12 / month",
      "Overage at $0.14 / minute",
    ],
  },
  {
    id: "scale",
    name: "Custom",
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
      "Multiple locations, departments, or brands",
      "Custom assistants, numbers, minutes, and integrations",
      "Security review, SSO, and audit exports",
      "Dedicated implementation and success support",
    ],
  },
];

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return (
    STRIPE_PLANS.find(
      (p) =>
        process.env[p.priceIdEnv] === priceId ||
        process.env[p.annualPriceIdEnv] === priceId ||
        (p.extraAgentPriceIdEnv ? process.env[p.extraAgentPriceIdEnv] === priceId : false) ||
        (p.overagePriceIdEnv ? process.env[p.overagePriceIdEnv] === priceId : false),
    ) || null
  );
}

export function planById(id: string | null | undefined): StripePlan | null {
  if (!id) return null;
  if (id === "lite" || id === "business-lite") return STRIPE_PLANS.find((p) => p.id === "business-starter") || null;
  if (id === "pro" || id === "business-growth") return STRIPE_PLANS.find((p) => p.id === "starter") || null;
  if (id === "business" || id === "enterprise") return STRIPE_PLANS.find((p) => p.id === "scale") || null;
  return STRIPE_PLANS.find((p) => p.id === id) || null;
}

export function plansForClient() {
  return STRIPE_PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    price_usd_monthly: p.price_usd_monthly,
    price_usd_annual: p.price_usd_annual,
    max_agents: p.max_agents,
    voice_minutes_monthly: p.voice_minutes_monthly,
    overage_per_min_usd: p.overage_per_min_usd,
    included_phone_numbers: p.included_phone_numbers,
    extra_agent_price_usd: p.extra_agent_price_usd ?? null,
    features: p.features,
    configured: !!process.env[p.priceIdEnv],
    annual_configured: !!process.env[p.annualPriceIdEnv],
    contact_sales: p.price_usd_monthly === 0,
    public: p.public !== false,
  }));
}
