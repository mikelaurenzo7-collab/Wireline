/**
 * Usage billing rate card (client-safe, no env or server imports).
 *
 * Shared work across calls, SMS, emails and Computer, with identities included in
 * each public plan. Extra identities are flat add-ons. The retired offer stays
 * in the rate card only so billing periods already stored under it keep their
 * recorded allowance. New work defaults to Starter.
 *
 * Design and margin math: /workspace/launch/usage-billing-design.md (mirrored in
 * docs/USAGE_BILLING.md). Every number here must match the Stripe objects the
 * setup script creates; `tests/usage-billing-catalog.test.ts` pins both.
 */

export const USAGE_PLAN_ID = "usage" as const;
export const USAGE_CATALOG_VERSION = "2026-10-usage-v2" as const;
export const USAGE_TIERS = {
  previous: {
    id: "previous",
    name: "Previous",
    monthlyUsd: 19,
    includedWorkUsd: 12,
    includedNumbers: 0,
    includedEmailAddresses: 0,
    computerBudgetUsd: 3,
  },
  lite: {
    id: "lite",
    name: "Lite",
    monthlyUsd: 12,
    includedWorkUsd: 4,
    includedNumbers: 1,
    includedEmailAddresses: 1,
    computerBudgetUsd: 1,
  },
  standard: {
    id: "standard",
    name: "Starter",
    monthlyUsd: 24,
    includedWorkUsd: 14,
    includedNumbers: 1,
    includedEmailAddresses: 1,
    computerBudgetUsd: 3.5,
  },
  plus: {
    id: "plus",
    name: "Plus",
    monthlyUsd: 49,
    includedWorkUsd: 36,
    includedNumbers: 2,
    includedEmailAddresses: 2,
    computerBudgetUsd: 9,
  },
} as const;
export type UsageTierId = keyof typeof USAGE_TIERS;
export const PUBLIC_USAGE_TIERS = ["lite", "standard", "plus"] as const;
export const DEFAULT_PUBLIC_USAGE_TIER: UsageTierId = "standard";
/** Starter's monthly price. Omitted tiers use this, not a retired offer. */
export const USAGE_BASE_USD_MONTHLY = USAGE_TIERS[DEFAULT_PUBLIC_USAGE_TIER].monthlyUsd;
/** Starter's included work. Omitted allowances use this, not a retired offer. */
export const USAGE_INCLUDED_WORK_USD = USAGE_TIERS[DEFAULT_PUBLIC_USAGE_TIER].includedWorkUsd;
export function publicUsageTierId(value: unknown): UsageTierId {
  return PUBLIC_USAGE_TIERS.find((tier) => tier === value) ?? DEFAULT_PUBLIC_USAGE_TIER;
}
export function isUsageTierId(value: unknown): value is UsageTierId {
  return typeof value === "string" && Object.hasOwn(USAGE_TIERS, value);
}
/**
 * Omitted tiers are the current Starter plan. A stored retired id keeps its
 * rate: billing periods written before the key rename carry "starter", which
 * resolves to the same retired record under its current key, "previous".
 */
export function usageTier(value: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER) {
  const key = (value as string) === "starter" ? "previous" : value;
  return USAGE_TIERS[key as UsageTierId] ?? USAGE_TIERS[DEFAULT_PUBLIC_USAGE_TIER];
}
/** Stripe meters cents of work; native quantities remain in the local ledger. */
export const USAGE_WORK_EVENT_NAME = "botbound_work_credits_v2";

export type UsageMeterKey = "call_minutes" | "emails_handled" | "computer_minutes" | "sms_segments";
export type UsageAddonKey = "number" | "email_address";

export interface UsageTier {
  /** Inclusive upper bound of this tier in billed units; null is unbounded. */
  upTo: number | null;
  unitUsd: number;
}

export interface UsageMeterRate {
  key: UsageMeterKey;
  label: string;
  unitLabel: string;
  included: number;
  /** Graduated tiers applied to units above `included`. */
  tiers: readonly UsageTier[];
  /** Default Stripe meter event name; overridable by env on the server. */
  defaultEventName: string;
}

export const USAGE_METERS: Record<UsageMeterKey, UsageMeterRate> = {
  sms_segments: {
    key: "sms_segments",
    label: "SMS sent",
    unitLabel: "segment",
    included: 0,
    tiers: [{ upTo: null, unitUsd: 0.04 }],
    defaultEventName: USAGE_WORK_EVENT_NAME,
  },
  call_minutes: {
    key: "call_minutes",
    label: "Call minutes",
    unitLabel: "minute",
    included: 0,
    tiers: [{ upTo: null, unitUsd: 0.25 }],
    defaultEventName: USAGE_WORK_EVENT_NAME,
  },
  emails_handled: {
    key: "emails_handled",
    label: "Emails handled",
    unitLabel: "email",
    included: 0,
    tiers: [{ upTo: null, unitUsd: 0.02 }],
    defaultEventName: USAGE_WORK_EVENT_NAME,
  },
  computer_minutes: {
    key: "computer_minutes",
    label: "Computer minutes",
    unitLabel: "minute",
    included: 0,
    tiers: [{ upTo: null, unitUsd: 0.2 }],
    defaultEventName: USAGE_WORK_EVENT_NAME,
  },
};

export const USAGE_ADDONS: Record<
  UsageAddonKey,
  { key: UsageAddonKey; label: string; usdMonthly: number }
> = {
  number: { key: "number", label: "BotBound number", usdMonthly: 3 },
  email_address: { key: "email_address", label: "BotBound email address", usdMonthly: 4 },
};

/** Owner spend alerts, each sent once per billing period. */
export const USAGE_SPEND_ALERT_THRESHOLDS = [50, 80, 100] as const;
export const USAGE_DEFAULT_MONTHLY_CAP_USD = 100;
/** The lowest cap is the fixed monthly charges plus this headroom for usage. */
export const USAGE_MIN_CAP_HEADROOM_USD = 5;
export const USAGE_MAX_MONTHLY_CAP_USD = 25_000;

/** What every account gets without a meter. */
export const USAGE_NEVER_PAY_FOR = ["Bots", "Summaries"] as const;

export interface UsageQuantities {
  smsSegments?: number;
  callMinutes: number;
  emailsHandled: number;
  computerMinutes: number;
  numbers: number;
  emailAddresses: number;
}

export interface UsageBillLine {
  key: UsageMeterKey | UsageAddonKey | "base" | "included_work";
  label: string;
  quantity: number;
  amountUsd: number;
}

export interface UsageBillEstimate {
  totalUsd: number;
  fixedUsd: number;
  meteredUsd: number;
  workUsd: number;
  includedUsedUsd: number;
  includedRemainingUsd: number;
  lines: UsageBillLine[];
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeQuantity(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Gross work value before the shared allowance, never a separate free bucket. */
export function priceMeter(key: UsageMeterKey, periodQuantity: number): number {
  return cents(priceMeterExact(key, periodQuantity));
}

/** Unrounded period price, so cap clamping never gains a rounding half cent. */
export function priceMeterExact(key: UsageMeterKey, periodQuantity: number): number {
  const meter = USAGE_METERS[key];
  let remaining = Math.max(0, safeQuantity(periodQuantity) - meter.included);
  let previousBound = 0;
  let total = 0;
  for (const tier of meter.tiers) {
    if (remaining <= 0) break;
    const width = tier.upTo === null ? remaining : Math.max(0, tier.upTo - previousBound);
    const billed = Math.min(remaining, width);
    total += billed * tier.unitUsd;
    remaining -= billed;
    if (tier.upTo !== null) previousBound = tier.upTo;
  }
  return total;
}

export function pooledWorkUsd(totals: Partial<Record<UsageMeterKey, number>>): number {
  return (Object.keys(USAGE_METERS) as UsageMeterKey[]).reduce(
    (sum, key) => sum + priceMeterExact(key, totals[key] ?? 0),
    0,
  );
}

export function pooledOverageUsd(
  totals: Partial<Record<UsageMeterKey, number>>,
  tier: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER,
): number {
  return Math.max(0, pooledWorkUsd(totals) - usageTier(tier).includedWorkUsd);
}

export function workCredits(key: UsageMeterKey, quantity: number): number {
  return Math.round(priceMeterExact(key, quantity) * 100 * 10_000) / 10_000;
}

/** Fixed monthly charges: base plus chosen add-ons. */
export function fixedMonthlyUsd(
  addons: Pick<UsageQuantities, "numbers" | "emailAddresses">,
  tier: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER,
): number {
  return cents(
    usageTier(tier).monthlyUsd +
      Math.floor(safeQuantity(addons.numbers)) * USAGE_ADDONS.number.usdMonthly +
      Math.floor(safeQuantity(addons.emailAddresses)) * USAGE_ADDONS.email_address.usdMonthly,
  );
}

export function minimumMonthlyCapUsd(
  addons: Pick<UsageQuantities, "numbers" | "emailAddresses">,
  tier: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER,
): number {
  return cents(fixedMonthlyUsd(addons, tier) + USAGE_MIN_CAP_HEADROOM_USD);
}

/** Live estimate shared by the pricing estimator, billing UI and cap math. */
export function estimateUsageBill(
  input: UsageQuantities,
  tier: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER,
): UsageBillEstimate {
  const plan = usageTier(tier);
  const numbers = Math.floor(safeQuantity(input.numbers));
  const emailAddresses = Math.floor(safeQuantity(input.emailAddresses));
  const lines: UsageBillLine[] = [
    { key: "base", label: plan.name, quantity: 1, amountUsd: plan.monthlyUsd },
    {
      key: "sms_segments",
      label: USAGE_METERS.sms_segments.label,
      quantity: Math.floor(safeQuantity(input.smsSegments)),
      amountUsd: priceMeter("sms_segments", Math.floor(safeQuantity(input.smsSegments))),
    },
    {
      key: "call_minutes",
      label: USAGE_METERS.call_minutes.label,
      quantity: safeQuantity(input.callMinutes),
      amountUsd: priceMeter("call_minutes", input.callMinutes),
    },
    {
      key: "emails_handled",
      label: USAGE_METERS.emails_handled.label,
      quantity: safeQuantity(input.emailsHandled),
      amountUsd: priceMeter("emails_handled", input.emailsHandled),
    },
    {
      key: "computer_minutes",
      label: USAGE_METERS.computer_minutes.label,
      quantity: safeQuantity(input.computerMinutes),
      amountUsd: priceMeter("computer_minutes", input.computerMinutes),
    },
  ];
  if (numbers > 0) {
    lines.push({
      key: "number",
      label: USAGE_ADDONS.number.label,
      quantity: numbers,
      amountUsd: cents(numbers * USAGE_ADDONS.number.usdMonthly),
    });
  }
  if (emailAddresses > 0) {
    lines.push({
      key: "email_address",
      label: USAGE_ADDONS.email_address.label,
      quantity: emailAddresses,
      amountUsd: cents(emailAddresses * USAGE_ADDONS.email_address.usdMonthly),
    });
  }
  const fixedUsd = fixedMonthlyUsd({ numbers, emailAddresses }, tier);
  // Stripe rounds the single shared meter once. Rounding each channel first
  // can add a cent when two fractional channels each contribute half a cent.
  const workUsd = cents(
    pooledWorkUsd({
      sms_segments: Math.floor(safeQuantity(input.smsSegments)),
      call_minutes: safeQuantity(input.callMinutes),
      emails_handled: safeQuantity(input.emailsHandled),
      computer_minutes: safeQuantity(input.computerMinutes),
    }),
  );
  const includedUsedUsd = Math.min(plan.includedWorkUsd, workUsd);
  const meteredUsd = cents(Math.max(0, workUsd - plan.includedWorkUsd));
  lines.push({
    key: "included_work",
    label: "Shared work allowance",
    quantity: 1,
    amountUsd: -includedUsedUsd,
  });
  return {
    totalUsd: cents(fixedUsd + meteredUsd),
    fixedUsd,
    meteredUsd,
    workUsd,
    includedUsedUsd,
    includedRemainingUsd: cents(plan.includedWorkUsd - includedUsedUsd),
    lines,
  };
}

/** Marginal price of the next unit at a period total, used for cap headroom. */
export function marginalUnitUsd(key: UsageMeterKey, periodQuantity: number): number {
  const meter = USAGE_METERS[key];
  const over = safeQuantity(periodQuantity) - meter.included;
  if (over < 0) return 0;
  for (const tier of meter.tiers) {
    if (tier.upTo === null || over < tier.upTo) return tier.unitUsd;
  }
  return meter.tiers[meter.tiers.length - 1]?.unitUsd ?? 0;
}

/** Thresholds newly crossed when spend moves from `previousPct` to `currentPct`. */
export function crossedAlertThresholds(previousPct: number, currentPct: number): number[] {
  return USAGE_SPEND_ALERT_THRESHOLDS.filter(
    (threshold) => previousPct < threshold && currentPct >= threshold,
  );
}

export function formatUsdCents(value: number): string {
  return value < 1 ? `${Math.round(value * 100)}¢` : `$${value.toFixed(2)}`;
}

/** Live prices for every Bot. These replace older prices saved in Training. */
export function currentPricingFacts(): string[] {
  const plans = PUBLIC_USAGE_TIERS.map((id) => {
    const plan = USAGE_TIERS[id];
    const numbers = `${plan.includedNumbers} phone number${plan.includedNumbers === 1 ? "" : "s"}`;
    const emails = `${plan.includedEmailAddresses} email address${plan.includedEmailAddresses === 1 ? "" : "es"}`;
    return `${plan.name} is $${plan.monthlyUsd}/month with $${plan.includedWorkUsd} of included work, ${numbers}, and ${emails}.`;
  });
  const sms = USAGE_METERS.sms_segments.tiers[0].unitUsd.toFixed(2);
  const calls = USAGE_METERS.call_minutes.tiers[0].unitUsd.toFixed(2);
  const email = USAGE_METERS.emails_handled.tiers[0].unitUsd.toFixed(2);
  const computer = USAGE_METERS.computer_minutes.tiers[0].unitUsd.toFixed(2);
  return [
    ...plans,
    `SMS is $${sms} per sent segment. Calls are $${calls} per minute, email replies are $${email}, and Computer is $${computer} per minute. Calls, SMS, email, and Computer share one monthly allowance.`,
    `Extra numbers are $${USAGE_ADDONS.number.usdMonthly}/month. Extra email addresses are $${USAGE_ADDONS.email_address.usdMonthly}/month.`,
    "Every plan includes unlimited Bots. Usage charges apply across all of them.",
    "Quote only these prices. If asked for a discount or a retired offer, give these prices and escalate instead of inventing an offer.",
  ];
}

/** Drop sentences that still quote a retired BotBound price. */
export function withoutStaleBotBoundPricing(text: string): string {
  if (!text || !isStaleBotBoundPricing(text)) return text;
  const kept = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .filter((part) => part.trim() && !isStaleBotBoundPricing(part));
  return kept.join("\n").trim();
}

export function currentPricingPromptBlock(): string {
  return [
    "CURRENT BOTBOUND PRICING",
    "These prices replace any older BotBound prices saved in Training.",
    ...currentPricingFacts(),
  ].join("\n");
}

/** Saved Training that still quotes a retired BotBound offer, not a customer's own price. */
export function isStaleBotBoundPricing(text: string): boolean {
  const lower = text.toLowerCase();
  // Amounts alone are not platform pricing: a salon or plumber may sell its
  // own $19/month membership. Require a named platform offer, and a complete
  // amount so "from $19" never consumes a customer's $190 or $1900 service.
  // Keep the vocabulary narrow; ambiguous customer-authored facts are retained.
  const retiredOffer =
    /\b(?:BotBound|Wireline)(?:\s+(?:starter|lite|plus|calls?|plans?|subscription|pricing|price|is|costs?|starts?|at|from|only|monthly))*\s*[:,-]?\s*\$(?:19(?:\.00)?(?!\d|\.\d)|190(?:\.00)?\s*\/\s*year\b|12\s+shared\b)/i;
  return (
    retiredOffer.test(text) ||
    lower.includes("channel packages include one bot") ||
    lower.includes("prepaid runtime balance")
  );
}
