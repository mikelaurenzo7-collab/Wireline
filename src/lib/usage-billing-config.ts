/**
 * Server-only usage billing release flag and Stripe object configuration.
 *
 * `USAGE_BILLING_ENABLED` defaults off and gates checkout and new metered work.
 * Receipts and reports for work already admitted continue settling after a
 * pause. Apply the usage migrations before deploying even with enrollment off.
 */
import {
  USAGE_WORK_EVENT_NAME,
  type UsageAddonKey,
  type UsageMeterKey,
  DEFAULT_PUBLIC_USAGE_TIER,
  type UsageTierId,
} from "./usage-billing-catalog";

export const USAGE_BILLING_FLAG = "USAGE_BILLING_ENABLED";

export function usageBillingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[USAGE_BILLING_FLAG]?.trim().toLowerCase() === "true";
}

export const USAGE_PRICE_ENV = {
  base: "STRIPE_USAGE_BASE_PRICE_ID",
  work: "STRIPE_USAGE_WORK_PRICE_ID",
  number: "STRIPE_USAGE_NUMBER_ADDON_PRICE_ID",
  email_address: "STRIPE_USAGE_EMAIL_ADDON_PRICE_ID",
} as const satisfies Record<"base" | "work" | UsageAddonKey, string>;

export const USAGE_TIER_PRICE_ENV = {
  starter: { base: USAGE_PRICE_ENV.base, work: USAGE_PRICE_ENV.work },
  lite: { base: "STRIPE_USAGE_LITE_BASE_PRICE_ID", work: "STRIPE_USAGE_LITE_WORK_PRICE_ID" },
  standard: {
    base: "STRIPE_USAGE_STARTER_BASE_PRICE_ID",
    work: "STRIPE_USAGE_STARTER_WORK_PRICE_ID",
  },
  plus: { base: "STRIPE_USAGE_PLUS_BASE_PRICE_ID", work: "STRIPE_USAGE_PLUS_WORK_PRICE_ID" },
} as const;

export const USAGE_METER_EVENT_ENV: Record<UsageMeterKey, string> = {
  sms_segments: "STRIPE_USAGE_WORK_METER_EVENT",
  call_minutes: "STRIPE_USAGE_WORK_METER_EVENT",
  emails_handled: "STRIPE_USAGE_WORK_METER_EVENT",
  computer_minutes: "STRIPE_USAGE_WORK_METER_EVENT",
};

/** Every env var the usage path needs, names only. */
export const USAGE_BILLING_ENV_VARS = [
  ...new Set([
    USAGE_BILLING_FLAG,
    ...Object.values(USAGE_PRICE_ENV),
    ...Object.values(USAGE_TIER_PRICE_ENV).flatMap(Object.values),
    ...new Set(Object.values(USAGE_METER_EVENT_ENV)),
  ]),
];

export function usagePriceId(
  key: keyof typeof USAGE_PRICE_ENV,
  env: NodeJS.ProcessEnv = process.env,
  tier: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER,
): string | null {
  const name =
    key === "base" || key === "work" ? USAGE_TIER_PRICE_ENV[tier][key] : USAGE_PRICE_ENV[key];
  return env[name]?.trim() || null;
}

export function usageMeterEventName(
  key: UsageMeterKey,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env[USAGE_METER_EVENT_ENV[key]]?.trim() || USAGE_WORK_EVENT_NAME;
}

/** Every price offered by the public form must exist before checkout opens. */
export function usageCheckoutConfigured(
  env: NodeJS.ProcessEnv = process.env,
  tier: UsageTierId = DEFAULT_PUBLIC_USAGE_TIER,
): boolean {
  return (
    usageBillingEnabled(env) &&
    Boolean(
      usagePriceId("base", env, tier) &&
      usagePriceId("work", env, tier) &&
      usagePriceId("number", env) &&
      usagePriceId("email_address", env),
    )
  );
}

/** Usage price ids, used to recognize a usage subscription from its items. */
export function usagePriceIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    [
      ...Object.values(USAGE_PRICE_ENV),
      ...Object.values(USAGE_TIER_PRICE_ENV).flatMap(Object.values),
    ]
      .map((key) => env[key]?.trim())
      .filter((value): value is string => Boolean(value)),
  );
}
