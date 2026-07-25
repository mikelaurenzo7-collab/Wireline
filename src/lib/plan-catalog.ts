/** Stripe-backed launch plan catalog. Public plan ids remain canonical. */

/**
 * Conservative blended variable voice reserve used for pricing guardrails.
 * Includes carrier, voice runtime, model, and operational variance.
 */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;
export const PHONE_NUMBER_COST_MONTHLY_USD = 1.15;
export const PAYMENT_PROCESSING_RATE = 0.029;
export const PAYMENT_PROCESSING_FIXED_USD = 0.3;

export const FOUNDER_CATALOG_VERSION = "founder_early_access_2026_07_v5";

export const EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY = 15;
export const EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY = 50;
export const EXTRA_AGENT_ADDON_PHONE_NUMBERS = 1;
export const EXTRA_AGENT_ADDON_PRICE_ENV = "STRIPE_EXTRA_AGENT_PRICE_ID";
/** Cadence AI (acct_1TkyXL8e6If87QKm) founder catalog — keep in sync with scripts/.stripe-env.generated.json */
export const EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID = "price_1Tv9K58e6If87QKm7rzn3MNS";

export type StripePlanId = "personal" | "starter" | "team" | "business" | "enterprise";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  price_usd_annual: number;
  max_agents: number;
  voice_minutes_monthly: number;
  /**
   * Subscription-funded flexible runtime for optional work. Voice minutes remain
   * separately guaranteed so document/research/SMS usage cannot disable the phone agent.
   */
  runtime_allowance_usd_monthly: number;
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
  extra_agent_voice_minutes_monthly?: number;
  extra_agent_included_phone_numbers?: number;
  extraAgentPriceIdEnv?: string;
  extraAgentFallbackPriceId?: string;
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

const PAID_EXTRA_AGENT_ADDON = {
  extra_agent_price_usd: EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY,
  extra_agent_voice_minutes_monthly: EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY,
  extra_agent_included_phone_numbers: EXTRA_AGENT_ADDON_PHONE_NUMBERS,
  extraAgentPriceIdEnv: EXTRA_AGENT_ADDON_PRICE_ENV,
  extraAgentFallbackPriceId: EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID,
} satisfies Partial<StripePlan>;

const EXTRA_AGENT_FEATURE =
  "+$15/mo per additional live agent adds 50 guaranteed voice minutes and 1 number slot";

/**
 * Founder Early Access commercial contract:
 * - Free Builder creates, trains, and privately simulates one draft agent.
 * - Every paid tier guarantees live voice capacity and an on-demand number slot.
 * - Paid extra-agent add-ons increase both agent count and included voice capacity.
 * - Voice is the primary pricing driver because it is the only mandatory, high-variable-cost channel.
 * - Optional SMS, platform AI/research, enrichment, and business-artifact generation use a
 *   smaller flexible monthly Runtime Allowance included in the same subscription.
 * - Connected customer email, calendar, CRM, commerce, and data providers retain their own limits.
 * - Runtime Balance funds only usage beyond included capacity; there is no automatic postpaid meter.
 * - Active calls finish normally; depleted coverage blocks only the next paid action.
 */
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Wireline Free Builder",
    price_usd_monthly: 0,
    price_usd_annual: 0,
    max_agents: 1,
    voice_minutes_monthly: 0,
    runtime_allowance_usd_monthly: 0,
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
    price_usd_annual: 99,
    max_agents: 1,
    voice_minutes_monthly: 20,
    runtime_allowance_usd_monthly: 0.5,
    overage_per_min_usd: 0.25,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_STARTER_9_PRICE_ID",
    annualPriceIdEnv: "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1Tv9K08e6If87QKmt8n8bkiX",
    fallbackAnnualPriceId: "price_1TvlQa8e6If87QKmm9GTajo6",
    lookupKeyMonthly: "starter_monthly_founder_2026_07_v2",
    lookupKeyAnnual: "starter_annual_founder_2026_07_v3",
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "1 live AI communications agent",
      "1 production-number slot, provisioned when needed",
      "20 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$0.50 monthly flexible Runtime Allowance",
      "Voice, SMS, and email under one employee identity",
      "Lead Hunt access and connected email workflows",
      "Automatic post-call summary, outcome, note, and next action",
      "No automatic overages",
    ],
  },
  {
    id: "team",
    name: "Wireline Starter Plus",
    price_usd_monthly: 24,
    price_usd_annual: 240,
    max_agents: 2,
    voice_minutes_monthly: 50,
    runtime_allowance_usd_monthly: 1,
    overage_per_min_usd: 0.22,
    included_phone_numbers: 2,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    annualPriceIdEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1TwueT8e6If87QKmTtr6cZx5",
    fallbackAnnualPriceId: "price_1TwueU8e6If87QKmMd7x8Urj",
    lookupKeyMonthly: "team_monthly_founder_2026_07_v5",
    lookupKeyAnnual: "team_annual_founder_2026_07_v5",
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "2 live agents — personal Concierge + business AI employee",
      "2 production-number slots, provisioned when needed",
      "50 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$1 monthly flexible Runtime Allowance",
      "Full Lead Hunt, enrichment, niche research, email, and SMS workflows",
      "Branded call and weekly recap share links",
      "Automatic post-call summary, outcome, note, and next action",
      "No automatic overages",
    ],
  },
  {
    id: "business",
    name: "Wireline Pro",
    price_usd_monthly: 59,
    price_usd_annual: 590,
    max_agents: 5,
    voice_minutes_monthly: 100,
    runtime_allowance_usd_monthly: 4,
    overage_per_min_usd: 0.19,
    included_phone_numbers: 5,
    priceIdEnv: "STRIPE_TEAM_PRICE_ID",
    annualPriceIdEnv: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1Tv9K28e6If87QKmoe22FUz1",
    fallbackAnnualPriceId: "price_1Tv9K38e6If87QKm3OsZgYcy",
    lookupKeyMonthly: "business_monthly_founder_2026_07_v2",
    lookupKeyAnnual: "business_annual_founder_2026_07_v2",
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "Up to 5 live AI communications agents",
      "Up to 5 production-number slots, provisioned when needed",
      "100 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$4 monthly flexible Runtime Allowance",
      "Lead Hunt campaigns, enrichment, niche research, routing, and approvals",
      "Connected calendar, CRM, email, SMS, contracts, and commerce actions",
      "Branded call and weekly recap share links",
      "Automatic post-call summary, outcome, note, and next action",
      "No automatic overages",
    ],
  },
  {
    id: "enterprise",
    name: "Wireline Business",
    price_usd_monthly: 149,
    price_usd_annual: 1490,
    max_agents: 15,
    voice_minutes_monthly: 250,
    runtime_allowance_usd_monthly: 10,
    overage_per_min_usd: 0.17,
    included_phone_numbers: 15,
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    annualPriceIdEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1Tv9K38e6If87QKmkWgepqBn",
    fallbackAnnualPriceId: "price_1Tv9K48e6If87QKm4pwXGJGl",
    lookupKeyMonthly: "enterprise_monthly_founder_2026_07_v2",
    lookupKeyAnnual: "enterprise_annual_founder_2026_07_v2",
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "Up to 15 live AI communications agents",
      "Up to 15 production-number slots, provisioned when needed",
      "250 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$10 monthly flexible Runtime Allowance",
      "Lead Hunt, enrichment, analytics, CRM controls, routing, and approvals",
      "Connected calendar, email, SMS, contracts, payments, and commerce actions",
      "Branded call and weekly recap share links",
      "Automatic post-call summary, outcome, note, and next action",
      "Priority support posture and no automatic overages",
    ],
  },
];

export const LAUNCH_CONTRIBUTION_MARGIN_FLOOR = 0.45;

export type BillingInterval = "month" | "year";

/**
 * Conservative contribution margin at full included utilization.
 *
 * This is intentionally stricter than observed-use margin: it reserves every
 * included voice minute, every number slot, the flexible runtime allowance,
 * and Stripe processing. Shared SaaS and founder time are not included.
 */
export function estimatedContributionMarginAtFullIncludedUsage(
  plan: StripePlan,
  interval: BillingInterval,
): number {
  const recurringRevenue =
    interval === "year" ? plan.price_usd_annual / 12 : plan.price_usd_monthly;
  if (recurringRevenue <= 0) return 1;

  const processingCost =
    interval === "year"
      ? (plan.price_usd_annual * PAYMENT_PROCESSING_RATE + PAYMENT_PROCESSING_FIXED_USD) / 12
      : plan.price_usd_monthly * PAYMENT_PROCESSING_RATE + PAYMENT_PROCESSING_FIXED_USD;
  const reservedVariableCost =
    plan.voice_minutes_monthly * VOICE_VARIABLE_COST_PER_MIN_USD +
    plan.included_phone_numbers * PHONE_NUMBER_COST_MONTHLY_USD +
    plan.runtime_allowance_usd_monthly +
    processingCost;

  return (recurringRevenue - reservedVariableCost) / recurringRevenue;
}

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

function configuredExtraAgentPriceId(plan: StripePlan): string | null {
  const envPrice = plan.extraAgentPriceIdEnv ? process.env[plan.extraAgentPriceIdEnv] : null;
  return envPrice || plan.extraAgentFallbackPriceId || null;
}

export function planPriceId(plan: StripePlan, interval: "month" | "year"): string | null {
  return configuredPriceId(plan, interval);
}

export function planExtraAgentPriceId(plan: StripePlan): string | null {
  return configuredExtraAgentPriceId(plan);
}

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return (
    STRIPE_PLANS.find(
      (plan) =>
        configuredPriceId(plan, "month") === priceId ||
        configuredPriceId(plan, "year") === priceId ||
        configuredExtraAgentPriceId(plan) === priceId ||
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

/** Paid plans that include room for a personal agent + a business AI employee. */
export function supportsFounderAgentPair(planId: string | null | undefined): boolean {
  const plan = planById(planId);
  return Boolean(plan && plan.price_usd_monthly > 0 && plan.max_agents >= 2);
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
    runtime_allowance_usd_monthly: plan.runtime_allowance_usd_monthly,
    overage_per_min_usd: plan.overage_per_min_usd,
    included_phone_numbers: plan.included_phone_numbers,
    extra_agent_price_usd: plan.extra_agent_price_usd ?? null,
    extra_agent_voice_minutes_monthly: plan.extra_agent_voice_minutes_monthly ?? 0,
    extra_agent_included_phone_numbers: plan.extra_agent_included_phone_numbers ?? 0,
    extra_agent_configured: !!configuredExtraAgentPriceId(plan),
    features: plan.features,
    configured: plan.id === "personal" || !!configuredPriceId(plan, "month"),
    annual_configured: plan.id === "personal" || !!configuredPriceId(plan, "year"),
    contact_sales: false,
    is_free: plan.id === "personal",
    public: true,
    pricing_model: "guaranteed_voice_plus_flexible_runtime" as const,
  }));
}
