/**
 * Usage billing rate card (client-safe, no env or server imports).
 *
 * Shared work across calls, SMS, emails and Computer, with identities included in
 * each public plan. Extra identities are flat add-ons. The original offer is
 * retained for existing subscriptions and historical billing periods only.
 *
 * Design and margin math: /workspace/launch/usage-billing-design.md (mirrored in
 * docs/USAGE_BILLING.md). Every number here must match the Stripe objects the
 * setup script creates; `tests/usage-billing-catalog.test.ts` pins both.
 */

export const USAGE_PLAN_ID = "usage" as const;
export const USAGE_CATALOG_VERSION = "2026-10-usage-v2" as const;
/** One allowance across all kinds of work. Resets each subscription month. */
export const USAGE_INCLUDED_WORK_USD = 12;
export const USAGE_TIERS = {
  starter: {
    id: "starter",
    name: "Original",
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
export function publicUsageTierId(value: unknown): UsageTierId {
  return PUBLIC_USAGE_TIERS.find((tier) => tier === value) ?? DEFAULT_PUBLIC_USAGE_TIER;
}
export function isUsageTierId(value: unknown): value is UsageTierId {
  return typeof value === "string" && Object.hasOwn(USAGE_TIERS, value);
}
/** Missing historical values belong to the original $19 offer. */
export function usageTier(value: UsageTierId = "starter") {
  return USAGE_TIERS[value];
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

export const USAGE_BASE_USD_MONTHLY = 19;

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
export const USAGE_NEVER_PAY_FOR = ["Bots", "Roles", "Summaries"] as const;

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
  tier: UsageTierId = "starter",
): number {
  return Math.max(0, pooledWorkUsd(totals) - usageTier(tier).includedWorkUsd);
}

export function workCredits(key: UsageMeterKey, quantity: number): number {
  return Math.round(priceMeterExact(key, quantity) * 100 * 10_000) / 10_000;
}

/** Fixed monthly charges: base plus chosen add-ons. */
export function fixedMonthlyUsd(
  addons: Pick<UsageQuantities, "numbers" | "emailAddresses">,
  tier: UsageTierId = "starter",
): number {
  return cents(
    usageTier(tier).monthlyUsd +
      Math.floor(safeQuantity(addons.numbers)) * USAGE_ADDONS.number.usdMonthly +
      Math.floor(safeQuantity(addons.emailAddresses)) * USAGE_ADDONS.email_address.usdMonthly,
  );
}

export function minimumMonthlyCapUsd(
  addons: Pick<UsageQuantities, "numbers" | "emailAddresses">,
  tier: UsageTierId = "starter",
): number {
  return cents(fixedMonthlyUsd(addons, tier) + USAGE_MIN_CAP_HEADROOM_USD);
}

/** Live estimate shared by the pricing estimator, billing UI and cap math. */
export function estimateUsageBill(
  input: UsageQuantities,
  tier: UsageTierId = "starter",
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
