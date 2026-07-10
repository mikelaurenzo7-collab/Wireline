/** Stripe-backed launch plan catalog. Public plan ids remain canonical. */

/**
 * Conservative blended variable voice reserve used for pricing guardrails.
 * Includes carrier, voice runtime, model, and operational variance.
 */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;
export const PHONE_NUMBER_COST_MONTHLY_USD = 1.15;
export const PAYMENT_PROCESSING_RATE = 0.029;
export const PAYMENT_PROCESSING_FIXED_USD = 0.3;

export const FOUNDER_CATALOG_VERSION = "founder_early_access_2026_07_v2";

export type StripePlanId = "personal" | "starter" | "team" | "business" | "enterprise";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  price_usd_annual: number;
  max_agents: number;
  voice_minutes_monthly: number;
  overage_per_min_usd: number;
  included_phone_numbers: number;
  features: string[];
  priceIdEnv: string;
  annualPriceIdEnv: string;
  fallbackPriceId?: string;
  fallbackAnnualPriceId?: string;
  lookupKeyMonthly?: string;
  lookupKeyAnnual?: string;
  extra_agent_price_usd?: number;
  extraAgentPriceIdEnv?: string;
  overagePriceIdEnv?: string;
  public?: boolean;
};

type StripeCatalogPriceLike = {
  id?: string | null;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
};

const PLAN_ID_ALIASES: Record<string, StripePlanId> = {
  personal: "personal",
  free: "personal",
  builder: "personal",
  "free-builder": "personal",
  starter: "starter",
  solo: "starter",
  "starter-9": "starter",
  "business-starter": "starter",
  businessstarter: "starter",
  team: "team",
  plus: "team",
  "starter-plus": "team",
  starterplus: "team",
  shared: "team",
  business: "business",
  pro: "business",
  "business-growth": "business",
  businessgrowth: "business",
  enterprise: "enterprise",
  growth: "enterprise",
  "business-plus": "enterprise",
  custom: "enterprise",
  scale: "enterprise",
};

const PRICE_KEY_PLAN_PREFIXES: Record<string, StripePlanId> = {
  personal: "personal",
  starter: "starter",
  team: "team",
  business: "business",
  enterprise: "enterprise",
};

/**
 * Founder Early Access commercial contract:
 * - Free Builder creates, trains, and privately simulates one draft agent.
 * - Paid tiers include live agent capacity and on-demand number slots.
 * - Included voice capacity is deliberately conservative and profitable at full use.
 * - Lead Hunt is available on every paid plan. Connected customer data/mail providers
 *   retain their own limits; provider-funded enrichment, SMS, and extra voice consume
 *   prepaid Conversation Balance.
 * - There is no automatic postpaid metered overage line item.
 * - Active calls finish normally; depleted coverage blocks only the next live action.
 */
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Wireline Free Builder",
    price_usd_monthly: 0,
    price_usd_annual: 0,
    max_agents: 1,
    voice_minutes_monthly: 0,
    overage_per_min_usd: 0.25,
    included_phone_numbers: 0,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    annualPriceIdEnv: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
    public: true,
    features: [
      "1 private draft AI communications agent",
      "Agent setup, training, knowledge, and private simulation",
      "No production number or paid provider action until activation",
    ],
  },
  {
    id: "starter",
    name: "Wireline Starter",
    price_usd_monthly: 9,
    price_usd_annual: 90,
    max_agents: 1,
    voice_minutes_monthly: 20,
    overage_per_min_usd: 0.25,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_STARTER_9_PRICE_ID",
    annualPriceIdEnv: "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1TraB4JohDtfy3IkKFF3zI5C",
    fallbackAnnualPriceId: "price_1TraBAJohDtfy3IkgLxLqDVI",
    lookupKeyMonthly: "starter_monthly_founder_2026_07_v2",
    lookupKeyAnnual: "starter_annual_founder_2026_07_v2",
    features: [
      "1 live AI communications agent",
      "1 production-number slot, provisioned when needed",
      "20 pooled live-call minutes each month",
      "Lead Hunt workspace access",
      "Connected email workflows and conversation inbox",
      "Prepaid Conversation Balance for SMS, enrichment, and extra voice",
      "No automatic overages",
    ],
  },
  {
    id: "team",
    name: "Wireline Starter Plus",
    price_usd_monthly: 19,
    price_usd_annual: 190,
    max_agents: 1,
    voice_minutes_monthly: 75,
    overage_per_min_usd: 0.22,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    annualPriceIdEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1TrZ9AJohDtfy3Ika0bPG5Dc",
    fallbackAnnualPriceId: "price_1TrZ9GJohDtfy3IkUxOJscJZ",
    lookupKeyMonthly: "team_monthly_founder_2026_07_v2",
    lookupKeyAnnual: "team_annual_founder_2026_07_v2",
    features: [
      "1 live AI communications agent",
      "1 production-number slot, provisioned when needed",
      "75 pooled live-call minutes each month",
      "Full Lead Hunt, enrichment, and niche-research workflows",
      "Connected email and SMS automation",
      "Shared conversation inbox, outcomes, and private simulation",
      "Prepaid Conversation Balance for controlled extra usage",
      "No automatic overages",
    ],
  },
  {
    id: "business",
    name: "Wireline Pro",
    price_usd_monthly: 59,
    price_usd_annual: 590,
    max_agents: 5,
    voice_minutes_monthly: 250,
    overage_per_min_usd: 0.19,
    included_phone_numbers: 5,
    priceIdEnv: "STRIPE_TEAM_PRICE_ID",
    annualPriceIdEnv: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1TrZ9RJohDtfy3Ik9Q4QFABQ",
    fallbackAnnualPriceId: "price_1TrZ9XJohDtfy3Ikp1RQzxrj",
    lookupKeyMonthly: "business_monthly_founder_2026_07_v2",
    lookupKeyAnnual: "business_annual_founder_2026_07_v2",
    features: [
      "Up to 5 live AI communications agents",
      "Up to 5 production-number slots, provisioned when needed",
      "250 pooled live-call minutes each month",
      "Lead Hunt campaigns, enrichment, and tailored niche research",
      "Shared inbox, routing, approvals, and team visibility",
      "Connected email and SMS automation",
      "Prepaid Conversation Balance for controlled extra usage",
      "No automatic overages",
    ],
  },
  {
    id: "enterprise",
    name: "Wireline Business",
    price_usd_monthly: 149,
    price_usd_annual: 1490,
    max_agents: 15,
    voice_minutes_monthly: 650,
    overage_per_min_usd: 0.17,
    included_phone_numbers: 15,
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    annualPriceIdEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1TrZ9gJohDtfy3Ik7zHhg92a",
    fallbackAnnualPriceId: "price_1TrZ9pJohDtfy3Ik0zUieFvi",
    lookupKeyMonthly: "enterprise_monthly_founder_2026_07_v2",
    lookupKeyAnnual: "enterprise_annual_founder_2026_07_v2",
    features: [
      "Up to 15 live AI communications agents",
      "Up to 15 production-number slots, provisioned when needed",
      "650 pooled live-call minutes each month",
      "Lead Hunt, enrichment, analytics, and CRM controls",
      "Role-aware policies, routing, approvals, and team visibility",
      "Connected email and SMS automation",
      "Priority support posture",
      "Prepaid Conversation Balance for controlled extra usage",
      "No automatic overages",
    ],
  },
];

export function canonicalPlanId(id: string | null | undefined): StripePlanId | null {
  const cleaned = id?.trim().toLowerCase();
  if (!cleaned) return null;
  return PLAN_ID_ALIASES[cleaned] || null;
}

function configuredPriceId(plan: StripePlan, interval: "month" | "year"): string | null {
  const envKey = interval === "year" ? plan.annualPriceIdEnv : plan.priceIdEnv;
  const fallback = interval === "year" ? plan.fallbackAnnualPriceId : plan.fallbackPriceId;
  return process.env[envKey] || fallback || null;
}

export function planPriceId(plan: StripePlan, interval: "month" | "year"): string | null {
  return configuredPriceId(plan, interval);
}

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return (
    STRIPE_PLANS.find(
      (plan) =>
        configuredPriceId(plan, "month") === priceId ||
        configuredPriceId(plan, "year") === priceId ||
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

export function planLookupKey(plan: StripePlan, interval: "month" | "year"): string | null {
  return interval === "year" ? plan.lookupKeyAnnual || null : plan.lookupKeyMonthly || null;
}

/** Public API catalog for Free Builder and all self-serve founder plans. */
export function plansForClient() {
  return STRIPE_PLANS.filter((plan) => plan.public !== false).map((plan) => ({
    id: plan.id,
    name: plan.name,
    price_usd_monthly: plan.price_usd_monthly,
    price_usd_annual: plan.price_usd_annual,
    max_agents: plan.max_agents,
    voice_minutes_monthly: plan.voice_minutes_monthly,
    overage_per_min_usd: plan.overage_per_min_usd,
    included_phone_numbers: plan.included_phone_numbers,
    extra_agent_price_usd: null,
    features: plan.features,
    configured: plan.id === "personal" || !!configuredPriceId(plan, "month"),
    annual_configured: plan.id === "personal" || !!configuredPriceId(plan, "year"),
    contact_sales: false,
    is_free: plan.id === "personal",
    public: true,
    pricing_model: "included_minutes_plus_prepaid_balance" as const,
  }));
}
