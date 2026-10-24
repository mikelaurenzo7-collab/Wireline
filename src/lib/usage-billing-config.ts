/**
 * Server-only usage billing release flag and Stripe object configuration.
 *
 * `USAGE_BILLING_ENABLED` defaults off. Every usage path checks this flag first,
 * so with the flag off no new table is read, no meter event is sent and every
 * existing package checkout, cap and copy surface behaves exactly as before.
 */
import { USAGE_METERS, type UsageAddonKey, type UsageMeterKey } from "./usage-billing-catalog";

export const USAGE_BILLING_FLAG = "USAGE_BILLING_ENABLED";

export function usageBillingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[USAGE_BILLING_FLAG]?.trim().toLowerCase() === "true";
}

export const USAGE_PRICE_ENV = {
  base: "STRIPE_USAGE_BASE_PRICE_ID",
  call_minutes: "STRIPE_USAGE_CALL_MINUTES_PRICE_ID",
  emails_handled: "STRIPE_USAGE_EMAILS_PRICE_ID",
  computer_minutes: "STRIPE_USAGE_COMPUTER_MINUTES_PRICE_ID",
  number: "STRIPE_USAGE_NUMBER_ADDON_PRICE_ID",
  email_address: "STRIPE_USAGE_EMAIL_ADDON_PRICE_ID",
} as const satisfies Record<"base" | UsageMeterKey | UsageAddonKey, string>;

export const USAGE_METER_EVENT_ENV: Record<UsageMeterKey, string> = {
  call_minutes: "STRIPE_USAGE_CALL_MINUTES_METER_EVENT",
  emails_handled: "STRIPE_USAGE_EMAILS_METER_EVENT",
  computer_minutes: "STRIPE_USAGE_COMPUTER_MINUTES_METER_EVENT",
};

/** Every env var the usage path needs, names only. */
export const USAGE_BILLING_ENV_VARS = [
  USAGE_BILLING_FLAG,
  ...Object.values(USAGE_PRICE_ENV),
  ...Object.values(USAGE_METER_EVENT_ENV),
] as const;

export function usagePriceId(
  key: keyof typeof USAGE_PRICE_ENV,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return env[USAGE_PRICE_ENV[key]]?.trim() || null;
}

export function usageMeterEventName(
  key: UsageMeterKey,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env[USAGE_METER_EVENT_ENV[key]]?.trim() || USAGE_METERS[key].defaultEventName;
}

/** The base and all three metered prices must exist before checkout opens. */
export function usageCheckoutConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    usageBillingEnabled(env) &&
    Boolean(
      usagePriceId("base", env) &&
      usagePriceId("call_minutes", env) &&
      usagePriceId("emails_handled", env) &&
      usagePriceId("computer_minutes", env),
    )
  );
}

/** Usage price ids, used to recognize a usage subscription from its items. */
export function usagePriceIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (Object.keys(USAGE_PRICE_ENV) as Array<keyof typeof USAGE_PRICE_ENV>)
      .map((key) => usagePriceId(key, env))
      .filter((value): value is string => Boolean(value)),
  );
}
