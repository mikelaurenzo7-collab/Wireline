/** Stripe-backed launch plan catalog. Public plan ids are canonical. */

/**
 * Conservative blended variable voice reserve used for pricing guardrails.
 * This includes carrier, voice runtime, model, and operational variance.
 */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;

export const FOUNDER_CATALOG_VERSION = "founder_early_access_2026_07";

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
  "business-starter": "starter",
  businessstarter: "starter",
  "personal-plus": "starter",
  plus: "starter",
  lite: "starter",
  "business-lite": "starter",
  businesslite: "starter",
  team: "team",
  shared: "team",
  pro: "business",
  business: "business",
  "business-growth": "business",
  businessgrowth: "business",
  scale: "enterprise",
  enterprise: "enterprise",
  custom: "enterprise",
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
 * - Paid tiers include production agents, one dedicated number per included agent,
 *   and a monthly pooled live-minute allowance.
 * - Every completed live-call attempt consumes at least one included minute.
 * - After the included pool is exhausted, prepaid Conversation Balance is used.
 * - There is no automatic postpaid metered overage line item.
 */
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Wireline Free Builder",
    price_usd_monthly: 0,
    price_usd_annual: 0,
    max_agents: 1,
    voice_minutes_monthly: 0,
    overage_per_min_usd: 0.2,
    included_phone_numbers: 0,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    annualPriceIdEnv: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
    public: false,
    features: [
      "One private draft profit agent",
      "Agent setup, training, and private simulation",
      "No production number or live outbound calling until activation",
    ],
  },
  {
    id: "starter",
    name: "Wireline Starter",
    price_usd_monthly: 19,
    price_usd_annual: 190,
    max_agents: 1,
    voice_minutes_monthly: 100,
    overage_per_min_usd: 0.2,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    annualPriceIdEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    lookupKeyMonthly: "starter_monthly_founder_2026_07",
    lookupKeyAnnual: "starter_annual_founder_2026_07",
    features: [
      "1 live AI profit agent",
      "1 included production number",
      "100 pooled live-call minutes each month",
      "Call logs, outcomes, and private simulation",
      "Conversation Balance for controlled extra usage",
      "No automatic overages",
    ],
  },
  {
    id: "team",
    name: "Wireline Team",
    price_usd_monthly: 59,
    price_usd_annual: 590,
    max_agents: 4,
    voice_minutes_monthly: 400,
    overage_per_min_usd: 0.18,
    included_phone_numbers: 4,
    priceIdEnv: "STRIPE_TEAM_PRICE_ID",
    annualPriceIdEnv: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    lookupKeyMonthly: "team_monthly_founder_2026_07",
    lookupKeyAnnual: "team_annual_founder_2026_07",
    features: [
      "4 live AI profit agents",
      "4 included production numbers",
      "400 pooled live-call minutes each month",
      "Shared inbox, routing, approvals, and team visibility",
      "Conversation Balance for controlled extra usage",
      "No automatic overages",
    ],
  },
  {
    id: "business",
    name: "Wireline Business",
    price_usd_monthly: 149,
    price_usd_annual: 1490,
    max_agents: 8,
    voice_minutes_monthly: 1200,
    overage_per_min_usd: 0.16,
    included_phone_numbers: 8,
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    annualPriceIdEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    lookupKeyMonthly: "business_monthly_founder_2026_07",
    lookupKeyAnnual: "business_annual_founder_2026_07",
    features: [
      "8 live AI profit agents",
      "8 included production numbers",
      "1,200 pooled live-call minutes each month",
      "Analytics, CRM controls, role-aware policies, and approvals",
      "Priority support posture",
      "Conversation Balance for controlled extra usage",
      "No automatic overages",
    ],
  },
  {
    id: "enterprise",
    name: "Wireline Enterprise",
    price_usd_monthly: 0,
    price_usd_annual: 0,
    max_agents: 999,
    voice_minutes_monthly: 0,
    overage_per_min_usd: 0,
    included_phone_numbers: 0,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    annualPriceIdEnv: "STRIPE_ENTERPRISE_ANNUAL_PRICE_ID",
    public: true,
    features: [
      "Committed usage and rollout planning",
      "SSO, audit support, and governed policy controls",
      "Custom integrations, telephony, retention, and SLAs",
      "Implementation and launch support",
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

/** Public API catalog for self-serve paid plans plus contact-sales Enterprise. */
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
    configured:
      plan.price_usd_monthly === 0 ||
      !!process.env[plan.priceIdEnv] ||
      (!!process.env.STRIPE_SECRET_KEY && !!plan.lookupKeyMonthly),
    annual_configured:
      plan.price_usd_annual === 0 ||
      !!process.env[plan.annualPriceIdEnv] ||
      (!!process.env.STRIPE_SECRET_KEY && !!plan.lookupKeyAnnual),
    contact_sales: plan.price_usd_monthly === 0,
    public: true,
    pricing_model: "included_minutes_plus_prepaid_balance" as const,
  }));
}
