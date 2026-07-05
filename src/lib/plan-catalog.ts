/** Stripe-backed plan catalog. Public ids are canonical even when env names remain transitional. */

/** Blended variable voice cost reserve used for pricing guardrails. */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;

export type StripePlanId = "personal" | "team" | "business" | "enterprise";

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
  /** Retained for internal flows but not necessarily offered in recurring checkout. */
  public?: boolean;
};

type StripeCatalogPriceLike = {
  id?: string | null;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
};

const PLAN_ID_ALIASES: Record<string, StripePlanId> = {
  personal: "personal",
  "personal-plus": "team",
  plus: "team",
  team: "team",
  shared: "team",
  lite: "team",
  "business-lite": "team",
  businesslite: "team",
  "business-starter": "team",
  businessstarter: "team",
  pro: "business",
  starter: "business",
  business: "business",
  "business-growth": "business",
  businessgrowth: "business",
  scale: "enterprise",
  enterprise: "enterprise",
  custom: "enterprise",
};

const PRICE_KEY_PLAN_PREFIXES: Record<string, StripePlanId> = {
  personal: "personal",
  team: "team",
  business: "business",
  enterprise: "enterprise",
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
    name: "Wireline Personal",
    price_usd_monthly: 0,
    max_agents: 1,
    voice_minutes_monthly: 60,
    overage_per_min_usd: 0.2,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    extra_agent_price_usd: 0,
    extraAgentPriceIdEnv: "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 0,
    annualPriceIdEnv: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PERSONAL_OVERAGE_PRICE_ID",
    public: false,
    features: [
      "Create and train for free before anything goes live",
      "One active agent and one number",
      "Live calls, texts, and follow-up funded through Conversation Balance",
    ],
  },
  {
    id: "team",
    name: "Wireline Team",
    price_usd_monthly: 29,
    max_agents: 4,
    voice_minutes_monthly: 500,
    overage_per_min_usd: 0.18,
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
    id: "business",
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
    id: "enterprise",
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

export function canonicalPlanId(id: string | null | undefined): StripePlanId | null {
  const cleaned = id?.trim().toLowerCase();
  if (!cleaned) return null;
  return PLAN_ID_ALIASES[cleaned] || null;
}

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

function planByPriceKey(priceKey: string | null | undefined): StripePlan | null {
  const prefix = priceKey?.trim().toLowerCase().split("_")[0];
  const planId = prefix ? PRICE_KEY_PLAN_PREFIXES[prefix] : null;
  return planId ? planById(planId) : null;
}

/**
 * Resolve a Stripe price to a Wireline plan using the live Stripe catalog contract first.
 *
 * The launch catalog writes wireline_plan_id and wireline_price_key onto every
 * recurring plan price. Reading that metadata makes webhook sync resilient to
 * rotated or non-synced STRIPE_*_PRICE_ID env vars. Env price IDs remain a
 * fallback for older catalog entries and local development.
 */
export function planByStripePrice(
  price: StripeCatalogPriceLike | null | undefined,
): StripePlan | null {
  if (!price) return null;

  const metadataPlan = planById(price.metadata?.wireline_plan_id);
  if (metadataPlan) return metadataPlan;

  const metadataPriceKeyPlan = planByPriceKey(price.metadata?.wireline_price_key);
  if (metadataPriceKeyPlan) return metadataPriceKeyPlan;

  const lookupKeyPlan = planByPriceKey(price.lookup_key);
  if (lookupKeyPlan) return lookupKeyPlan;

  return planByPriceId(price.id);
}

export function planById(id: string | null | undefined): StripePlan | null {
  const canonical = canonicalPlanId(id);
  if (!canonical) return null;
  return STRIPE_PLANS.find((plan) => plan.id === canonical) || null;
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
