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

export const USAGE_METER_EVENT_ENV: Record<UsageMeterKey, string> = {
  call_minutes: "STRIPE_USAGE_WORK_METER_EVENT",
  emails_handled: "STRIPE_USAGE_WORK_METER_EVENT",
  computer_minutes: "STRIPE_USAGE_WORK_METER_EVENT",
};

/** Every env var the usage path needs, names only. */
export const USAGE_BILLING_ENV_VARS = [
  USAGE_BILLING_FLAG,
  ...Object.values(USAGE_PRICE_ENV),
  ...new Set(Object.values(USAGE_METER_EVENT_ENV)),
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
  return env[USAGE_METER_EVENT_ENV[key]]?.trim() || USAGE_WORK_EVENT_NAME;
}

/** Every price offered by the public form must exist before checkout opens. */
export function usageCheckoutConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    usageBillingEnabled(env) &&
    Boolean(
      usagePriceId("base", env) &&
      usagePriceId("work", env) &&
      usagePriceId("number", env) &&
      usagePriceId("email_address", env),
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
