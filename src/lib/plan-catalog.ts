import { selfServeBillingEnabled } from "./billing-release";
import { VOICE_COMPLETION_GRACE_MINUTES } from "./voice-funding-policy";
import { BOT_MARK_IDENTITY_CAPACITY } from "./bot-mark";
import { USAGE_BASE_USD_MONTHLY, USAGE_METERS } from "./usage-billing-catalog";

/** Stripe-backed launch plan catalog. Public plan ids remain canonical. */

/**
 * Conservative blended variable voice reserve used for pricing guardrails.
 * Includes carrier, voice runtime, model, and operational variance.
 */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;
/**
 * Per-tenant observed-COGS health headroom. A single tenant's blended rate
 * naturally sits above the modeled fleet average (short calls carry per-call
 * overhead, premium voices) without implying fleet-margin drift, so tenant
 * health checks compare observed cost against reserve × this ratio. Shared by
 * the voice-reliability health summary and its Insights tile so the banner
 * and the tile can never disagree. Catalog-level pricing review uses
 * COGS_DRIFT_THRESHOLD_PER_MIN_USD in tenant-economics instead.
 */
export const TENANT_OBSERVED_COGS_HEADROOM_RATIO = 1.15;
export const PHONE_NUMBER_COST_MONTHLY_USD = 1.15;
/** AgentMail capacity allocation per paid Bot; not an additional invoice on top of the base subscription. */
export const MANAGED_MAILBOX_COST_MONTHLY_USD = 2;
export const PAYMENT_PROCESSING_RATE = 0.029;
export const PAYMENT_PROCESSING_FIXED_USD = 0.3;
/** Stripe Billing fee on recurring subscription volume. */
export const STRIPE_BILLING_RATE = 0.007;
/**
 * Conservative Stripe Tax transaction reserve. The live account has no tax
 * registrations yet, but launch economics must remain safe when registrations
 * are added rather than requiring an emergency repricing later.
 */
export const STRIPE_TAX_TRANSACTION_RATE = 0.005;

export const FOUNDER_CATALOG_VERSION = "channel_plans_2026_09_v2";
/** Free Builder's bounded private model-training reserve. */
export const FREE_BUILDER_AI_ALLOWANCE_USD = 1.5;

/** Published prepaid top-up rate, shared by catalog, billing, and UI. */
export const FLAT_OVERAGE_PER_MIN_USD = 0.22;

export const EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY = 15;
export const EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY = 50;
export const EXTRA_AGENT_ADDON_PHONE_NUMBERS = 1;
export const EXTRA_AGENT_ADDON_PRICE_ENV = "STRIPE_EXTRA_AGENT_PRICE_ID";
/** BotBound founder catalog. Keep in sync with scripts/.stripe-env.generated.json. */
export const EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID = "price_1Tv9K58e6If87QKm7rzn3MNS";

export type CommunicationChannel = "voice" | "email" | "sms";
export type ChannelSelectionId =
  "voice" | "email" | "sms" | "voice-email" | "voice-sms" | "email-sms" | "omnichannel";
export type CapacityTier = "light" | "regular" | "high";
export type ChannelPlanId =
  ChannelSelectionId | `${ChannelSelectionId}-regular` | `${ChannelSelectionId}-high`;
export type StripePlanId =
  "personal" | "starter" | "team" | "business" | "enterprise" | "usage" | ChannelPlanId;
export type CheckoutAvailability = "available" | "sms_readiness_required" | "legacy_only";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  price_usd_annual: number;
  max_agents: number;
  voice_minutes_monthly: number;
  /**
   * Subscription-funded flexible runtime for optional work. Voice minutes remain
   * separately guaranteed so document, research, and text usage cannot disable the Voice Bot.
   */
  runtime_allowance_usd_monthly: number;
  /**
   * Independently metered platform-funded model, research, and enrichment COGS.
   * This reserve is deliberately separate from Runtime Allowance and voice.
   */
  ai_spend_allowance_usd_monthly: number;
  overage_per_min_usd: number;
  included_phone_numbers: number;
  included_mailboxes: number;
  channels: readonly CommunicationChannel[];
  catalogFamily?: "channels" | "legacy";
  capacityTier?: CapacityTier;
  checkoutAvailability: CheckoutAvailability;
  features: string[];
  priceIdEnv?: string;
  annualPriceIdEnv?: string;
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
  usage: "usage",
  voice: "voice",
  email: "email",
  sms: "sms",
  "voice-email": "voice-email",
  "voice-sms": "voice-sms",
  "email-sms": "email-sms",
  omnichannel: "omnichannel",
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
  // Scale/custom are sales intents, not aliases for a self-serve plan.
};

const PRICE_KEY_PLAN_PREFIXES: Record<string, StripePlanId> = {
  usage: "usage",
  voice: "voice",
  email: "email",
  sms: "sms",
  "voice-email": "voice-email",
  "voice-sms": "voice-sms",
  "email-sms": "email-sms",
  omnichannel: "omnichannel",
  personal: "personal",
  starter: "starter",
  team: "team",
  business: "business",
  enterprise: "enterprise",
};

const CHANNEL_CAPACITIES: {
  tier: CapacityTier;
  minutes: number;
  baseAi: number;
  emailAi: number;
  smsAi: number;
  transport: number;
}[] = [
  { tier: "light", minutes: 50, baseAi: 1.5, emailAi: 2.5, smsAi: 2.5, transport: 2 },
  { tier: "regular", minutes: 250, baseAi: 3, emailAi: 10, smsAi: 7, transport: 10 },
  { tier: "high", minutes: 500, baseAi: 5, emailAi: 30, smsAi: 15, transport: 30 },
];
const CHANNEL_OFFERS: {
  id: ChannelSelectionId;
  label: string;
  channels: CommunicationChannel[];
  prices: readonly [number, number][];
}[] = [
  {
    id: "voice",
    label: "Calls",
    channels: ["voice"],
    prices: [
      [19, 199],
      [59, 690],
      [115, 1349],
    ],
  },
  {
    id: "email",
    label: "Email",
    channels: ["email"],
    prices: [
      [9, 90],
      [29, 290],
      [69, 690],
    ],
  },
  {
    id: "sms",
    label: "SMS",
    channels: ["sms"],
    prices: [
      [12, 120],
      [29, 339],
      [79, 899],
    ],
  },
  {
    id: "voice-email",
    label: "Calls + Email",
    channels: ["voice", "email"],
    prices: [
      [25, 259],
      [79, 899],
      [159, 1799],
    ],
  },
  {
    id: "voice-sms",
    label: "Calls + SMS",
    channels: ["voice", "sms"],
    prices: [
      [24, 249],
      [79, 939],
      [179, 2039],
    ],
  },
  {
    id: "email-sms",
    label: "Email + SMS",
    channels: ["email", "sms"],
    prices: [
      [18, 180],
      [49, 499],
      [129, 1399],
    ],
  },
  {
    id: "omnichannel",
    label: "Calls + Email + SMS",
    channels: ["voice", "email", "sms"],
    prices: [
      [29, 309],
      [99, 1109],
      [219, 2549],
    ],
  },
];
for (const offer of CHANNEL_OFFERS) {
  for (const capacity of CHANNEL_CAPACITIES) {
    const id: ChannelPlanId = capacity.tier === "light" ? offer.id : `${offer.id}-${capacity.tier}`;
    PLAN_ID_ALIASES[id] = id;
    PRICE_KEY_PLAN_PREFIXES[id] = id;
  }
}

const PAID_EXTRA_AGENT_ADDON = {
  extra_agent_price_usd: EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY,
  extra_agent_voice_minutes_monthly: EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY,
  extra_agent_included_phone_numbers: EXTRA_AGENT_ADDON_PHONE_NUMBERS,
  extraAgentPriceIdEnv: EXTRA_AGENT_ADDON_PRICE_ENV,
  extraAgentFallbackPriceId: EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID,
} satisfies Partial<StripePlan>;

const EXTRA_AGENT_FEATURE =
  "+$15/mo per additional live Bot adds 50 guaranteed voice minutes and 1 production-number slot; the active Bot gets its line automatically";

/**
 * Channel launch catalog:
 * - Personal is the paid plan for one person: calls and a computer, with their own inbox.
 * - New paid packages include one Bot and only their selected channels.
 * - Calls/SMS share one customer-selected number; Email includes one managed mailbox.
 * - SMS packages stay visible but cannot check out until carrier/cost readiness.
 * - Every provider attempt is bounded by its separately funded allowance.
 * - Runtime Balance covers overflow; there is no automatic usage invoice.
 * - Calls reserve prepaid coverage plus bounded completion credit before acceptance.
 * - Historical plans remain resolvable for existing records, never new checkout.
 */
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "BotBound Personal",
    price_usd_monthly: 12,
    price_usd_annual: 120,
    max_agents: 1,
    voice_minutes_monthly: 20,
    runtime_allowance_usd_monthly: 0,
    ai_spend_allowance_usd_monthly: 1,
    overage_per_min_usd: FLAT_OVERAGE_PER_MIN_USD,
    included_phone_numbers: 1,
    included_mailboxes: 0,
    channels: ["voice"],
    catalogFamily: "channels",
    capacityTier: "light",
    checkoutAvailability: "available",
    public: true,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    annualPriceIdEnv: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1UTcVu8e6If87QKmf7GYiZsO",
    fallbackAnnualPriceId: "price_1UTcVw8e6If87QKmEKbinlnv",
    lookupKeyMonthly: "personal_monthly_paid_2026_10_v3",
    lookupKeyAnnual: "personal_annual_paid_2026_10_v3",
    features: [
      "1 Bot",
      "20 live call minutes each month",
      "1 call at a time",
      "1 local phone number",
      "Connect Gmail or Outlook to use the inbox you already have",
      "$1.00 monthly managed allowance for AI",
      "Cloud computer for web tasks, billed to the AI allowance",
      "Up to 10 additional completion minutes within the call limit; any balance due pauses new calls and prepaid extras",
      "No automatic balance purchases or overage invoices",
    ],
  },
  {
    id: "starter",
    name: "BotBound Starter",
    price_usd_monthly: 19,
    price_usd_annual: 190,
    max_agents: 1,
    voice_minutes_monthly: 50,
    runtime_allowance_usd_monthly: 1,
    ai_spend_allowance_usd_monthly: 1.5,
    overage_per_min_usd: FLAT_OVERAGE_PER_MIN_USD,
    included_phone_numbers: 1,
    included_mailboxes: 1,
    channels: ["voice", "email", "sms"],
    catalogFamily: "legacy",
    checkoutAvailability: "legacy_only",
    public: false,
    priceIdEnv: "STRIPE_STARTER_9_PRICE_ID",
    annualPriceIdEnv: "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1Tx5X78e6If87QKmltXpASRU",
    fallbackAnnualPriceId: "price_1Tx5XD8e6If87QKmCuwmYCK5",
    lookupKeyMonthly: "starter_monthly_founder_2026_07_v6",
    lookupKeyAnnual: "starter_annual_founder_2026_07_v6",
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "1 live Voice Bot",
      "1 dedicated production number, provisioned automatically for the active Bot",
      "1 BotBound-managed email identity",
      "50 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$1 monthly Runtime Allowance + $1.50 managed AI allowance",
      "Voice, live conversations, text, and email under your Bot's identity",
      "Lead Hunt access and optional connected-mailbox workflows",
      "Automatic post-call summary, outcome, note, and next action",
      "No automatic overages",
    ],
  },
  {
    id: "team",
    name: "BotBound Starter Plus",
    price_usd_monthly: 39,
    price_usd_annual: 390,
    max_agents: 2,
    voice_minutes_monthly: 100,
    runtime_allowance_usd_monthly: 3,
    ai_spend_allowance_usd_monthly: 3,
    overage_per_min_usd: FLAT_OVERAGE_PER_MIN_USD,
    included_phone_numbers: 2,
    included_mailboxes: 2,
    channels: ["voice", "email", "sms"],
    catalogFamily: "legacy",
    checkoutAvailability: "legacy_only",
    public: false,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    annualPriceIdEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1Tx5XK8e6If87QKmQG9Jg0j2",
    fallbackAnnualPriceId: "price_1Tx5XU8e6If87QKmIwF251n6",
    lookupKeyMonthly: "team_monthly_founder_2026_07_v6",
    lookupKeyAnnual: "team_annual_founder_2026_07_v6",
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "2 live Bots in one workspace",
      "A dedicated production number for each active paid Bot, up to 2",
      "A BotBound-managed email identity for each active paid Bot",
      "100 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$3 monthly Runtime Allowance + $3 managed AI allowance",
      "Full Lead Hunt, enrichment, niche research, email, and text workflows",
      "Branded call and weekly recap share links",
      "Automatic post-call summary, outcome, note, and next action",
      "No automatic overages",
    ],
  },
  {
    id: "business",
    name: "BotBound Pro",
    price_usd_monthly: 79,
    price_usd_annual: 790,
    max_agents: 5,
    voice_minutes_monthly: 190,
    runtime_allowance_usd_monthly: 6,
    ai_spend_allowance_usd_monthly: 6,
    overage_per_min_usd: FLAT_OVERAGE_PER_MIN_USD,
    included_phone_numbers: 5,
    included_mailboxes: 5,
    channels: ["voice", "email", "sms"],
    catalogFamily: "legacy",
    checkoutAvailability: "legacy_only",
    public: false,
    priceIdEnv: "STRIPE_TEAM_PRICE_ID",
    annualPriceIdEnv: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1Tx5Xa8e6If87QKmf1bWe8ol",
    fallbackAnnualPriceId: "price_1Tx5Xg8e6If87QKmYFwRlCwi",
    lookupKeyMonthly: "business_monthly_founder_2026_07_v6",
    lookupKeyAnnual: "business_annual_founder_2026_07_v6",
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "Up to 5 live Bots",
      "A dedicated production number for each active paid Bot, up to 5",
      "A BotBound-managed email identity for each active paid Bot",
      "190 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$6 monthly Runtime Allowance + $6 managed AI allowance",
      "Lead Hunt campaigns, enrichment, niche research, routing, and approvals",
      "Connected calendar, CRM, optional mailbox, text, contracts, and commerce actions",
      "Branded call and weekly recap share links",
      "Automatic post-call summary, outcome, note, and next action",
      "No automatic overages",
    ],
  },
  {
    id: "enterprise",
    name: "BotBound Scale",
    price_usd_monthly: 159,
    price_usd_annual: 1590,
    max_agents: 15,
    voice_minutes_monthly: 350,
    runtime_allowance_usd_monthly: 12,
    ai_spend_allowance_usd_monthly: 12,
    overage_per_min_usd: FLAT_OVERAGE_PER_MIN_USD,
    included_phone_numbers: 15,
    included_mailboxes: 15,
    channels: ["voice", "email", "sms"],
    catalogFamily: "legacy",
    checkoutAvailability: "legacy_only",
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    annualPriceIdEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    fallbackPriceId: "price_1Tx5Xm8e6If87QKm7mC84oe8",
    fallbackAnnualPriceId: "price_1Tx5Xs8e6If87QKmGxEvongq",
    lookupKeyMonthly: "enterprise_monthly_founder_2026_07_v6",
    lookupKeyAnnual: "enterprise_annual_founder_2026_07_v6",
    public: false,
    ...PAID_EXTRA_AGENT_ADDON,
    features: [
      "Up to 15 live Bots",
      "A dedicated production number for each active paid Bot, up to 15",
      "A BotBound-managed email identity for each active paid Bot",
      "350 guaranteed live-voice minutes each month",
      EXTRA_AGENT_FEATURE,
      "$12 monthly Runtime Allowance + $12 managed AI allowance",
      "Lead Hunt, enrichment, analytics, CRM controls, routing, and approvals",
      "Connected calendar, optional mailbox, text, contracts, payments, and commerce actions",
      "Branded call and weekly recap share links",
      "Automatic post-call summary, outcome, note, and next action",
      "Priority support posture and no automatic overages",
    ],
  },
  ...CHANNEL_OFFERS.flatMap((offer) =>
    CHANNEL_CAPACITIES.map((capacity, index): StripePlan => {
      const { channels, label } = offer;
      const id: ChannelPlanId =
        capacity.tier === "light" ? offer.id : `${offer.id}-${capacity.tier}`;
      const voice = channels.includes("voice");
      const email = channels.includes("email");
      const sms = channels.includes("sms");
      const envPrefix = `STRIPE_${id.replaceAll("-", "_").toUpperCase()}`;
      const allowance =
        capacity.baseAi +
        (email ? capacity.emailAi - capacity.baseAi : 0) +
        (sms ? capacity.smsAi - capacity.baseAi : 0);
      const [monthly, annual] = offer.prices[index];
      return {
        id,
        name: `BotBound ${label} ${capacity.tier[0].toUpperCase()}${capacity.tier.slice(1)}`,
        channels,
        catalogFamily: "channels",
        capacityTier: capacity.tier,
        // Registration costs and funded inbound handling must be verified before sale.
        checkoutAvailability: sms ? "sms_readiness_required" : "available",
        public: true,
        price_usd_monthly: monthly,
        price_usd_annual: annual,
        max_agents: 1,
        voice_minutes_monthly: voice ? capacity.minutes : 0,
        included_phone_numbers: voice || sms ? 1 : 0,
        included_mailboxes: email ? 1 : 0,
        runtime_allowance_usd_monthly: sms ? capacity.transport : 0,
        ai_spend_allowance_usd_monthly: allowance,
        overage_per_min_usd: voice ? FLAT_OVERAGE_PER_MIN_USD : 0,
        priceIdEnv: `${envPrefix}_PRICE_ID`,
        annualPriceIdEnv: `${envPrefix}_ANNUAL_PRICE_ID`,
        // Stripe prices are immutable: changed Light/High Calls offers need
        // new keys while unchanged intervals retain their existing identity.
        lookupKeyMonthly: `${id}_monthly_channels_2026_09_${voice && capacity.tier !== "regular" ? "v2" : "v1"}`,
        lookupKeyAnnual: `${id}_annual_channels_2026_09_${voice && capacity.tier !== "regular" ? "v2" : "v1"}`,
        features: [
          "1 Bot",
          ...(voice
            ? [
                `${capacity.minutes.toLocaleString("en-US")} live call minutes each month`,
                "1 call at a time",
              ]
            : []),
          ...(voice || sms ? ["1 local phone number"] : []),
          ...(email ? ["1 BotBound email address"] : []),
          `$${allowance.toFixed(2)} monthly managed allowance for AI${email ? " and email delivery" : ""}${sms ? ", including phone validation" : ""}`,
          "Cloud computer for web tasks, billed to the AI allowance",
          ...(sms
            ? [
                `$${capacity.transport} monthly transport allowance`,
                "SMS activation requests receive a setup review; registration charges are quoted separately",
              ]
            : []),
          ...(voice
            ? [
                `Up to ${VOICE_COMPLETION_GRACE_MINUTES} additional completion minutes within the call limit; any balance due pauses new calls and prepaid extras`,
              ]
            : []),
          "No automatic balance purchases or overage invoices",
        ],
      };
    }),
  ),
];

/** Channel access follows the authoritative subscription plan, never a client toggle. */
export function planIncludesChannel(
  planId: string | null | undefined,
  channel: CommunicationChannel,
): boolean {
  return planById(planId)?.channels.includes(channel) === true;
}

/** Whether any public package that includes this channel can be bought self-serve. */
export function channelSoldSelfServe(channel: CommunicationChannel): boolean {
  return STRIPE_PLANS.some(
    (plan) =>
      plan.public &&
      plan.catalogFamily === "channels" &&
      plan.channels.includes(channel) &&
      plan.checkoutAvailability === "available",
  );
}

/** Order and duplicate selections do not change the canonical package. */
export function channelPlanForSelection(
  channels: readonly CommunicationChannel[],
  capacityTier: CapacityTier = "light",
): StripePlan | null {
  const selection = new Set(channels);
  return (
    STRIPE_PLANS.find(
      (plan) =>
        plan.id !== "personal" &&
        plan.catalogFamily === "channels" &&
        plan.capacityTier === capacityTier &&
        plan.channels.length === selection.size &&
        plan.channels.every((channel) => selection.has(channel)),
    ) ?? null
  );
}

/**
 * Two-floor margin policy (catalog v6; see docs/PRICING_DECISION_2026-07-25.md).
 *
 * Planning floor: contribution at EXPECTED_INCLUDED_UTILIZATION of minutes and
 * allowance (numbers, mailboxes, and one unpaid completion buffer reserved in full)
 * must clear LAUNCH_CONTRIBUTION_MARGIN_FLOOR.
 *
 * Hard floor: contribution at 100% utilization, the bounded worst case of a
 * bounded call-funding catalog, must clear HARD_CONTRIBUTION_MARGIN_FLOOR on both
 * intervals; annual discounted revenue with unchanged COGS is always binding.
 */
export const LAUNCH_CONTRIBUTION_MARGIN_FLOOR = 0.45;
export const HARD_CONTRIBUTION_MARGIN_FLOOR = 0.3;
export const EXPECTED_INCLUDED_UTILIZATION = 0.7;

export type BillingInterval = "month" | "year";

/** Conservative Stripe commercial fees for one successful charge. */
export function estimatedStripeCommercialFeesUsd(grossChargeUsd: number): number {
  if (!Number.isFinite(grossChargeUsd) || grossChargeUsd <= 0) return 0;
  return (
    grossChargeUsd * (PAYMENT_PROCESSING_RATE + STRIPE_BILLING_RATE + STRIPE_TAX_TRANSACTION_RATE) +
    PAYMENT_PROCESSING_FIXED_USD
  );
}

export type MonthlyPlanCostBreakdown = {
  revenueUsd: number;
  voiceUsd: number;
  /** One fully unpaid completion buffer, never probability-discounted. */
  completionGraceUsd: number;
  numbersUsd: number;
  mailboxesUsd: number;
  runtimeUsd: number;
  managedAiUsd: number;
  commercialFeesUsd: number;
  totalCostUsd: number;
};

type CostModelOptions = { utilization?: number; voiceCostPerMinuteUsd?: number };

function costModelInputs(options: CostModelOptions) {
  const utilization = options.utilization ?? 1;
  const voiceRate = options.voiceCostPerMinuteUsd ?? VOICE_VARIABLE_COST_PER_MIN_USD;
  if (!Number.isFinite(utilization) || utilization < 0 || utilization > 1) {
    throw new RangeError("Included utilization must be between zero and one.");
  }
  if (!Number.isFinite(voiceRate) || voiceRate < 0) {
    throw new RangeError("Voice cost must be a finite non-negative rate.");
  }
  return { utilization, voiceRate };
}

function withTotalCost(
  costs: Omit<MonthlyPlanCostBreakdown, "totalCostUsd">,
): MonthlyPlanCostBreakdown {
  return {
    ...costs,
    totalCostUsd:
      costs.voiceUsd +
      costs.completionGraceUsd +
      costs.numbersUsd +
      costs.mailboxesUsd +
      costs.runtimeUsd +
      costs.managedAiUsd +
      costs.commercialFeesUsd,
  };
}

/** Plan contribution model. Number and mailbox capacity stay reserved at every utilization. */
export function estimatedPlanMonthlyCosts(
  plan: StripePlan,
  interval: BillingInterval,
  options: CostModelOptions = {},
): MonthlyPlanCostBreakdown {
  const { utilization, voiceRate } = costModelInputs(options);
  const annual = interval === "year";
  const grossCharge = annual ? plan.price_usd_annual : plan.price_usd_monthly;
  return withTotalCost({
    revenueUsd: annual ? grossCharge / 12 : grossCharge,
    voiceUsd: plan.voice_minutes_monthly * utilization * voiceRate,
    completionGraceUsd:
      plan.catalogFamily === "channels" && plan.channels.includes("voice")
        ? VOICE_COMPLETION_GRACE_MINUTES * voiceRate
        : 0,
    numbersUsd: plan.included_phone_numbers * PHONE_NUMBER_COST_MONTHLY_USD,
    mailboxesUsd: plan.included_mailboxes * MANAGED_MAILBOX_COST_MONTHLY_USD,
    runtimeUsd: plan.runtime_allowance_usd_monthly * utilization,
    managedAiUsd: plan.ai_spend_allowance_usd_monthly * utilization,
    // One annual payment has one fixed processing fee, spread across 12 months.
    commercialFeesUsd: estimatedStripeCommercialFeesUsd(grossCharge) / (annual ? 12 : 1),
  });
}

/** Monthly extra-Bot capacity; grouped invoices share the parent's fixed payment fee. */
export function estimatedExtraAgentMonthlyCosts(
  plan: StripePlan,
  options: CostModelOptions & { separatePayment?: boolean } = {},
): MonthlyPlanCostBreakdown {
  const { utilization, voiceRate } = costModelInputs(options);
  const revenueUsd = plan.extra_agent_price_usd ?? 0;
  const enabled = revenueUsd > 0;
  return withTotalCost({
    revenueUsd,
    voiceUsd: enabled ? (plan.extra_agent_voice_minutes_monthly ?? 0) * utilization * voiceRate : 0,
    completionGraceUsd: 0,
    numbersUsd: enabled
      ? (plan.extra_agent_included_phone_numbers ?? 0) * PHONE_NUMBER_COST_MONTHLY_USD
      : 0,
    mailboxesUsd: enabled ? MANAGED_MAILBOX_COST_MONTHLY_USD : 0,
    runtimeUsd: 0,
    managedAiUsd: 0,
    commercialFeesUsd: enabled
      ? estimatedStripeCommercialFeesUsd(revenueUsd) -
        (options.separatePayment ? 0 : PAYMENT_PROCESSING_FIXED_USD)
      : 0,
  });
}

/** Conservative contribution margin at full included utilization. */
export function estimatedContributionMarginAtFullIncludedUsage(
  plan: StripePlan,
  interval: BillingInterval,
): number {
  const costs = estimatedPlanMonthlyCosts(plan, interval);
  const recurringRevenue = costs.revenueUsd;
  if (recurringRevenue <= 0) return 1;
  return (recurringRevenue - costs.totalCostUsd) / recurringRevenue;
}

/** Contribution margin at expected included utilization. */
export function estimatedContributionMarginAtExpectedUsage(
  plan: StripePlan,
  interval: BillingInterval,
): number {
  const costs = estimatedPlanMonthlyCosts(plan, interval, {
    utilization: EXPECTED_INCLUDED_UTILIZATION,
  });
  const recurringRevenue = costs.revenueUsd;
  if (recurringRevenue <= 0) return 1;
  return (recurringRevenue - costs.totalCostUsd) / recurringRevenue;
}

export function canonicalPlanId(id: string | null | undefined): StripePlanId | null {
  const cleaned = id?.trim().toLowerCase();
  if (!cleaned) return null;
  return PLAN_ID_ALIASES[cleaned] || null;
}

function configuredPriceId(plan: StripePlan, interval: "month" | "year"): string | null {
  const envKey = interval === "year" ? plan.annualPriceIdEnv : plan.priceIdEnv;
  const fallback = interval === "year" ? plan.fallbackAnnualPriceId : plan.fallbackPriceId;
  return (envKey ? process.env[envKey]?.trim() : null) || fallback || null;
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
  const usageBase = process.env.STRIPE_USAGE_BASE_PRICE_ID?.trim();
  if (usageBase && usageBase === priceId) return USAGE_PLAN;
  return (
    STRIPE_PLANS.find(
      (plan) =>
        plan.fallbackPriceId === priceId ||
        plan.fallbackAnnualPriceId === priceId ||
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
  if (canonical === USAGE_PLAN.id) return USAGE_PLAN;
  return STRIPE_PLANS.find((plan) => plan.id === canonical) || null;
}

/**
 * The usage plan (as many Bots as a workspace needs, billed by work done).
 *
 * Deliberately outside STRIPE_PLANS: package lineups, package economics and the
 * founder Stripe catalog contract stay exactly as they are, while webhooks,
 * entitlements and voice admission can still resolve a stored `usage` plan id.
 * Prices live in `usage-billing-catalog.ts`; voice minutes are metered to Stripe
 * (postpaid, spend-capped), so the prepaid wallet treats them as included.
 * `max_agents` is the identity-mark ceiling enforced by the database, not a
 * plan limit; `unlimitedBots` is what every surface shows.
 */
export const USAGE_PLAN: StripePlan & { unlimitedBots: true } = {
  id: "usage",
  name: "BotBound",
  price_usd_monthly: USAGE_BASE_USD_MONTHLY,
  price_usd_annual: 0,
  max_agents: BOT_MARK_IDENTITY_CAPACITY,
  voice_minutes_monthly: USAGE_METERS.call_minutes.included,
  runtime_allowance_usd_monthly: 0,
  ai_spend_allowance_usd_monthly: 2,
  overage_per_min_usd: USAGE_METERS.call_minutes.tiers[0].unitUsd,
  included_phone_numbers: 0,
  included_mailboxes: 0,
  channels: ["voice", "email"],
  checkoutAvailability: "available",
  features: [],
  priceIdEnv: "STRIPE_USAGE_BASE_PRICE_ID",
  public: false,
  unlimitedBots: true,
};

export function isUsagePlanId(id: string | null | undefined): boolean {
  return canonicalPlanId(id) === USAGE_PLAN.id;
}

/** Paid plans that include room for two independently configured Bots. */
export function supportsFounderAgentPair(planId: string | null | undefined): boolean {
  const plan = planById(planId);
  return Boolean(plan && plan.price_usd_monthly > 0 && plan.max_agents >= 2);
}

export function planLookupKey(plan: StripePlan, interval: "month" | "year"): string | null {
  return interval === "year" ? plan.lookupKeyAnnual || null : plan.lookupKeyMonthly || null;
}

/**
 * Public API catalog for Free Builder and all self-serve founder plans.
 *
 * `configured` is deliberately customer-facing availability, not merely the
 * presence of a Stripe price id. This keeps every client surface fail-closed
 * until the audited production release channel is authorized.
 */
export function plansForClient() {
  const checkoutReleased = selfServeBillingEnabled();

  return STRIPE_PLANS.filter((plan) => plan.public !== false).map((plan) => {
    const isFree = plan.price_usd_monthly === 0;
    const monthlyConfigured = !!configuredPriceId(plan, "month");
    const annualConfigured = !!configuredPriceId(plan, "year");
    const packageAvailable = plan.checkoutAvailability === "available";
    const paidCheckoutAvailable = checkoutReleased && packageAvailable && monthlyConfigured;
    const annualCheckoutAvailable = checkoutReleased && packageAvailable && annualConfigured;

    return {
      id: plan.id,
      name: plan.name,
      price_usd_monthly: plan.price_usd_monthly,
      price_usd_annual: plan.price_usd_annual,
      max_agents: plan.max_agents,
      voice_minutes_monthly: plan.voice_minutes_monthly,
      runtime_allowance_usd_monthly: plan.runtime_allowance_usd_monthly,
      ai_spend_allowance_usd_monthly: plan.ai_spend_allowance_usd_monthly,
      overage_per_min_usd: plan.overage_per_min_usd,
      included_phone_numbers: plan.included_phone_numbers,
      included_mailboxes: plan.included_mailboxes,
      channels: plan.channels,
      catalog_family: plan.catalogFamily ?? null,
      capacity_tier: plan.capacityTier ?? null,
      checkout_availability: plan.checkoutAvailability,
      extra_agent_price_usd: plan.extra_agent_price_usd ?? null,
      extra_agent_voice_minutes_monthly: plan.extra_agent_voice_minutes_monthly ?? 0,
      extra_agent_included_phone_numbers: plan.extra_agent_included_phone_numbers ?? 0,
      extra_agent_configured: !isFree && checkoutReleased && !!configuredExtraAgentPriceId(plan),
      features: plan.features,
      // These flags describe Stripe Checkout availability. Free Builder is
      // active without Stripe and must use the Studio path instead.
      configured: !isFree && paidCheckoutAvailable,
      annual_configured: !isFree && annualCheckoutAvailable,
      contact_sales: !isFree && !paidCheckoutAvailable && !annualCheckoutAvailable,
      is_free: isFree,
      public: true,
      pricing_model:
        plan.catalogFamily === "channels"
          ? ("channel_package" as const)
          : ("guaranteed_voice_plus_flexible_runtime" as const),
    };
  });
}
