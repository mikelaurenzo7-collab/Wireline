/**
 * Stripe-backed plan catalog.
 *
 * Backend billing source of truth. Public pricing/signup now uses:
 * personal, personal-plus, starter, scale.
 *
 * Compatibility note: Business Growth maps to the historical Pro Stripe env
 * vars and Scale maps to the historical Business Stripe env vars until the new
 * Stripe env names are created. This prevents checkout from breaking during the
 * naming transition.
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
  extra_agent_price_usd?: number;
  extraAgentPriceIdEnv?: string;
  price_usd_annual: number;
  annualPriceIdEnv: string;
  overagePriceIdEnv?: string;
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
    // Legacy Pro envs currently represent the $249 Business Growth tier.
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    extra_agent_price_usd: 29,
    extraAgentPriceIdEnv: "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 2_390,
    annualPriceIdEnv: "STRIPE_PRO_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PRO_OVERAGE_PRICE_ID",
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
    // Legacy Business envs currently represent the $699 Scale tier.
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    extra_agent_price_usd: 39,
    extraAgentPriceIdEnv: "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 6_710,
    annualPriceIdEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_BUSINESS_OVERAGE_PRICE_ID",
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
    configured: !!process.env[p.priceIdEnv],
    annual_configured: !!process.env[p.annualPriceIdEnv],
    contact_sales: false,
  }));
}
