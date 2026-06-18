/**
 * Stripe-backed plan catalog.
 *
 * This is the backend source of truth for billing/status/checkout. Keep these
 * ids aligned with public pricing, signup intent validation, and JSON-LD:
 *   personal, personal-plus, starter, scale.
 */

export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;

export type StripePlanId = "personal" | "personal-plus" | "starter" | "scale";

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
  legacyPriceIdEnvs?: string[];
  extra_agent_price_usd?: number;
  extraAgentPriceIdEnv?: string;
  legacyExtraAgentPriceIdEnvs?: string[];
  price_usd_annual: number;
  annualPriceIdEnv: string;
  legacyAnnualPriceIdEnvs?: string[];
  overagePriceIdEnv?: string;
  legacyOveragePriceIdEnvs?: string[];
};

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Personal",
    price_usd_monthly: 9,
    max_agents: 1,
    voice_minutes_monthly: 30,
    overage_per_min_usd: 0.25,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    extra_agent_price_usd: 9,
    extraAgentPriceIdEnv: "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 86,
    annualPriceIdEnv: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PERSONAL_OVERAGE_PRICE_ID",
    features: [
      "1 private Assistant included",
      "1 dedicated personal line included",
      "30 voice minutes / month for light personal coverage",
      "Siri, widget, and mobile automation surfaces",
      "Call screening, summaries, wait-on-hold, and follow-up queue",
      "Overage at $0.25 / min",
    ],
  },
  {
    id: "personal-plus",
    name: "Personal+",
    price_usd_monthly: 19,
    max_agents: 2,
    voice_minutes_monthly: 100,
    overage_per_min_usd: 0.22,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_PERSONAL_PLUS_PRICE_ID",
    extra_agent_price_usd: 9,
    extraAgentPriceIdEnv: "STRIPE_PERSONAL_PLUS_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 182,
    annualPriceIdEnv: "STRIPE_PERSONAL_PLUS_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PERSONAL_PLUS_OVERAGE_PRICE_ID",
    features: [
      "Higher monthly personal call volume",
      "Calendar and email context for appointment/status workflows",
      "Priority personal memory and follow-up queue",
      "Siri, widget, Action Button, and mobile automation surfaces",
      "Overage at $0.22 / min",
    ],
  },
  {
    id: "starter",
    name: "Business Growth",
    price_usd_monthly: 249,
    max_agents: 5,
    voice_minutes_monthly: 1_000,
    overage_per_min_usd: 0.18,
    included_phone_numbers: 5,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    legacyPriceIdEnvs: ["STRIPE_PRO_PRICE_ID"],
    extra_agent_price_usd: 29,
    extraAgentPriceIdEnv: "STRIPE_STARTER_EXTRA_AGENT_PRICE_ID",
    legacyExtraAgentPriceIdEnvs: ["STRIPE_PRO_EXTRA_AGENT_PRICE_ID"],
    price_usd_annual: 2_390,
    annualPriceIdEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    legacyAnnualPriceIdEnvs: ["STRIPE_PRO_ANNUAL_PRICE_ID"],
    overagePriceIdEnv: "STRIPE_STARTER_OVERAGE_PRICE_ID",
    legacyOveragePriceIdEnvs: ["STRIPE_PRO_OVERAGE_PRICE_ID"],
    features: [
      "5 AI agents included — add more anytime",
      "5 dedicated voice numbers included",
      "1,000 voice minutes / month",
      "Agent Studio, Training, Live Ops, and Analytics",
      "Outbound dialer + email/SMS follow-up workflows",
      "Up to 25 team seats",
      "Webhook + Action Engine",
      "Overage at $0.18 / min",
      "Priority support",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price_usd_monthly: 699,
    max_agents: 10,
    voice_minutes_monthly: 3_000,
    overage_per_min_usd: 0.16,
    included_phone_numbers: 10,
    priceIdEnv: "STRIPE_SCALE_PRICE_ID",
    legacyPriceIdEnvs: ["STRIPE_BUSINESS_PRICE_ID"],
    extra_agent_price_usd: 39,
    extraAgentPriceIdEnv: "STRIPE_SCALE_EXTRA_AGENT_PRICE_ID",
    legacyExtraAgentPriceIdEnvs: ["STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID"],
    price_usd_annual: 6_710,
    annualPriceIdEnv: "STRIPE_SCALE_ANNUAL_PRICE_ID",
    legacyAnnualPriceIdEnvs: ["STRIPE_BUSINESS_ANNUAL_PRICE_ID"],
    overagePriceIdEnv: "STRIPE_SCALE_OVERAGE_PRICE_ID",
    legacyOveragePriceIdEnvs: ["STRIPE_BUSINESS_OVERAGE_PRICE_ID"],
    features: [
      "10 AI agents included — add more anytime",
      "10 dedicated voice numbers included",
      "3,000 voice minutes / month",
      "Everything in Business Growth",
      "Admin model controls and audit log export",
      "Up to 50 team seats",
      "Dedicated success manager",
      "Priority support channel",
      "Overage at $0.16 / min",
    ],
  },
];

function envFirst(keys: Array<string | undefined>): string | undefined {
  for (const key of keys) {
    if (key && process.env[key]) return process.env[key];
  }
  return undefined;
}

export function monthlyPriceIdForPlan(plan: StripePlan): string | undefined {
  return envFirst([plan.priceIdEnv, ...(plan.legacyPriceIdEnvs ?? [])]);
}

export function annualPriceIdForPlan(plan: StripePlan): string | undefined {
  return envFirst([plan.annualPriceIdEnv, ...(plan.legacyAnnualPriceIdEnvs ?? [])]);
}

export function overagePriceIdForPlan(plan: StripePlan): string | undefined {
  return envFirst([plan.overagePriceIdEnv, ...(plan.legacyOveragePriceIdEnvs ?? [])]);
}

export function extraAgentPriceIdForPlan(plan: StripePlan): string | undefined {
  return envFirst([plan.extraAgentPriceIdEnv, ...(plan.legacyExtraAgentPriceIdEnvs ?? [])]);
}

export function allPriceIdsForPlan(plan: StripePlan): string[] {
  return [
    monthlyPriceIdForPlan(plan),
    annualPriceIdForPlan(plan),
    overagePriceIdForPlan(plan),
    extraAgentPriceIdForPlan(plan),
  ].filter((value): value is string => !!value);
}

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return STRIPE_PLANS.find((plan) => allPriceIdsForPlan(plan).includes(priceId)) || null;
}

export function planById(id: string | null | undefined): StripePlan | null {
  if (!id) return null;
  if (id === "pro") return STRIPE_PLANS.find((p) => p.id === "starter") || null;
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
    configured: !!monthlyPriceIdForPlan(p),
    annual_configured: !!annualPriceIdForPlan(p),
    contact_sales: false,
  }));
}
