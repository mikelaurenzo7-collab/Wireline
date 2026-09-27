/** Active new-sale Stripe manifest. Historical subscriptions remain read-only. */
export const FOUNDER_CATALOG_VERSION = "channel_plans_2026_09_v1";
// SMS stays a quote until carrier readiness. Email remains an explicit env opt-in.
const CHANNEL_OFFERS = [
  [
    "voice",
    "Calls",
    ["voice"],
    [
      [15, 150, 1.5],
      [59, 690, 3],
      [219, 2499, 5],
    ],
  ],
  [
    "email",
    "Email",
    ["email"],
    [
      [9, 90, 2.5],
      [29, 290, 10],
      [69, 690, 30],
    ],
  ],
  [
    "voice-email",
    "Calls + Email",
    ["voice", "email"],
    [
      [21, 210, 2.5],
      [79, 899, 10],
      [269, 2999, 30],
    ],
  ],
].flatMap(([baseId, label, channels, prices]) =>
  prices.map(([monthly, annual, allowance], index) => {
    const capacity = ["light", "regular", "high"][index];
    return {
      id: index === 0 ? baseId : `${baseId}-${capacity}`,
      label: `${label} ${capacity[0].toUpperCase()}${capacity.slice(1)}`,
      monthly,
      annual,
      channels,
      capacity,
      numbers: Number(channels.includes("voice")),
      mailboxes: Number(channels.includes("email")),
      minutes: channels.includes("voice") ? [30, 250, 1000][index] : 0,
      allowance,
    };
  }),
);
export const PUBLIC_SELF_SERVE_PLAN_IDS = CHANNEL_OFFERS.map((offer) => offer.id);
const metadataFor = (offer) => ({
  wireline_plan_id: offer.id,
  wireline_billing_model: "channel_package",
  wireline_catalog_state: "launch_active",
  wireline_channels: offer.channels.join(","),
  wireline_capacity_tier: offer.capacity,
  included_agents: "1",
  included_numbers: String(offer.numbers),
  included_mailboxes: String(offer.mailboxes),
  included_voice_minutes: String(offer.minutes),
  included_ai_spend_usd: String(offer.allowance),
  overage_policy: "bounded_completion_grace",
});
export const FOUNDER_PRODUCTS = [
  ...CHANNEL_OFFERS.map((offer) => ({
    key: offer.id,
    name: `BotBound ${offer.label}`,
    description: `1 Bot with ${offer.label.toLowerCase()}. ${offer.minutes ? `${offer.minutes} live-call minutes/month. Up to 10 additional completion minutes within the call limit; any balance due pauses new calls and prepaid extras. ` : ""}Managed AI${offer.mailboxes ? " and email delivery" : ""} allowance included. No automatic extra charges.`,
    defaultPriceKey: `${offer.id}_monthly_channels_2026_09_v1`,
    metadata: metadataFor(offer),
  })),
  {
    key: "scale",
    name: "BotBound Enterprise",
    description: "Custom capacity and implementation support. Contact us to review requirements.",
    defaultPriceKey: null,
    metadata: { wireline_offer: "enterprise_contact", wireline_catalog_state: "launch_active" },
  },
  {
    key: "conversation_balance",
    name: "BotBound Runtime Balance",
    description:
      "Prepaid Runtime Balance for usage beyond included capacity. No automatic extra charges.",
    defaultPriceKey: "balance_25",
    metadata: {
      wireline_offer: "conversation_balance",
      wireline_price_type: "conversation_balance",
      wireline_billing_model: "one_time_top_up",
      wireline_catalog_state: "launch_active",
    },
  },
];
export const FOUNDER_PRICES = [
  ...CHANNEL_OFFERS.flatMap((offer) =>
    ["month", "year"].map((interval) => {
      const annual = interval === "year";
      const key = `${offer.id}_${annual ? "annual" : "monthly"}_channels_2026_09_v1`;
      return {
        key,
        productKey: offer.id,
        nickname: `BotBound ${offer.label} - ${annual ? "Annual" : "Monthly"}`,
        lookupKey: key,
        unitAmount: (annual ? offer.annual : offer.monthly) * 100,
        recurring: { interval, usage_type: "licensed" },
        envTarget: `STRIPE_${offer.id.replaceAll("-", "_").toUpperCase()}_${annual ? "ANNUAL_" : ""}PRICE_ID`,
        metadata: metadataFor(offer),
      };
    }),
  ),
  ...[10, 25, 50, 100].map((amount) => ({
    key: `balance_${amount}`,
    productKey: "conversation_balance",
    nickname: `BotBound Runtime Balance - $${amount}`,
    lookupKey: null,
    unitAmount: amount * 100,
    recurring: null,
    envTarget: null,
    metadata: {
      wireline_price_type: "conversation_balance_top_up",
      wireline_amount_usd: String(amount),
    },
  })),
];

/** Never rewrite historical catalog objects as a side effect of the new launch. */
export function isHistoricalCatalogObject(object) {
  return (
    ["starter", "team", "business", "enterprise"].includes(object?.metadata?.wireline_plan_id) ||
    object?.metadata?.wireline_addon_id === "extra_agent" ||
    /founder_2026_07/.test(object?.lookup_key || object?.metadata?.wireline_price_key || "")
  );
}
export const PRODUCT_BY_KEY = new Map(FOUNDER_PRODUCTS.map((product) => [product.key, product]));
