/**
 * Stripe-backed plan catalog.
 *
 * max_agents is now the included agent bundle before paid add-ons, not a
 * strategic hard limit. Customers can buy extra agents through Stripe add-on
 * prices. Personal is intentionally much lower because personal users route
 * fewer calls; business plans monetize volume, teams, routing, and coaching.
 */

export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;

export type StripePlanId = "personal" | "starter" | "pro" | "business" | "enterprise";

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
      "1 AI voice agent included — add more anytime",
      "1 dedicated voice number included",
      "30 voice minutes / month for light personal coverage",
      "Default low-cost AI: Grok 4.3 or Gemini Flash",
      "Agent Studio model picker: Grok, Gemini, OpenAI, Anthropic, OpenRouter",
      "Call logs + transcripts + simple sentiment",
      "Overage at $0.25 / min",
      "Add more agents: $9/each/month",
    ],
  },
  {
    id: "starter",
    name: "Business Starter",
    price_usd_monthly: 79,
    max_agents: 2,
    voice_minutes_monthly: 300,
    overage_per_min_usd: 0.21,
    included_phone_numbers: 2,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    extra_agent_price_usd: 19,
    extraAgentPriceIdEnv: "STRIPE_STARTER_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 758,
    annualPriceIdEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_STARTER_OVERAGE_PRICE_ID",
    features: [
      "2 AI agents included — add more anytime",
      "2 dedicated voice numbers included",
      "300 voice minutes / month",
      "Default low-cost AI: Grok 4.3 or Gemini Flash",
      "Full Agent Studio model picker on every paid plan",
      "Outbound dialer (CSV + auto-dial)",
      "Live call monitor + sentiment",
      "Up to 5 team seats",
      "Overage at $0.21 / min",
      "Add more agents: $19/each/month",
    ],
  },
  {
    id: "pro",
    name: "Business Pro",
    price_usd_monthly: 249,
    max_agents: 5,
    voice_minutes_monthly: 1_000,
    overage_per_min_usd: 0.18,
    included_phone_numbers: 5,
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
      "Default low-cost AI with premium model override per agent",
      "Outbound dialer + email campaigns",
      "Up to 25 team seats",
      "Webhook + Action Engine",
      "Post-call coaching + agent training",
      "Overage at $0.18 / min",
      "Priority support",
      "Add more agents: $29/each/month",
    ],
  },
  {
    id: "business",
    name: "Business Scale",
    price_usd_monthly: 699,
    max_agents: 10,
    voice_minutes_monthly: 3_000,
    overage_per_min_usd: 0.16,
    included_phone_numbers: 10,
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
      "Everything in Business Pro",
      "Admin model controls for Grok, Gemini, OpenAI, Anthropic, and OpenRouter",
      "SSO + audit log export",
      "Up to 50 team seats",
      "Dedicated success manager",
      "Priority support channel",
      "Overage at $0.16 / min",
      "Add more agents: $39/each/month",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 0,
    max_agents: 25,
    voice_minutes_monthly: 15_000,
    overage_per_min_usd: 0.14,
    included_phone_numbers: 25,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    price_usd_annual: 0,
    annualPriceIdEnv: "STRIPE_ENTERPRISE_ANNUAL_PRICE_ID",
    features: [
      "25+ agents with custom bundles",
      "25+ numbers included + BYO carrier option",
      "15,000+ voice minutes with contracted volume pricing",
      "Everything in Business Scale",
      "Custom model-routing policy and usage budget controls",
      "SAML SSO + advanced compliance",
      "Custom data retention",
      "Dedicated success manager",
      "99.95% uptime SLA",
    ],
  },
];

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return (
    STRIPE_PLANS.find(
      (p) => process.env[p.priceIdEnv] === priceId || process.env[p.annualPriceIdEnv] === priceId,
    ) || null
  );
}

export function planById(id: string | null | undefined): StripePlan | null {
  if (!id) return null;
  return STRIPE_PLANS.find((p) => p.id === id) || null;
}

export function plansForClient() {
  return STRIPE_PLANS.map((p) => {
    const contactSales = p.price_usd_monthly === 0;
    return {
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
      configured: !contactSales && !!process.env[p.priceIdEnv],
      annual_configured: !contactSales && !!process.env[p.annualPriceIdEnv],
      contact_sales: contactSales,
    };
  });
}
