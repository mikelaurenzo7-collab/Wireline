#!/usr/bin/env node
/**
 * Deprecated guard.
 *
 * This script used the old launch_v2 Stripe catalog and must not be run for
 * the current Wireline launch model. The active runtime catalog is now:
 *
 *   personal       $9/mo
 *   personal-plus  $19/mo
 *   starter        $249/mo  (Business Growth)
 *   scale          $699/mo
 *
 * Until a new launch_v3 Stripe bootstrap is reviewed end-to-end, use the
 * Stripe Dashboard or connected Stripe tooling to create the missing prices,
 * then set the env vars listed below in Vercel.
 */

const requiredLaunchV3Env = [
  "STRIPE_PERSONAL_PRICE_ID",
  "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
  "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
  "STRIPE_PERSONAL_OVERAGE_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_ANNUAL_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_EXTRA_AGENT_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_OVERAGE_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_PRO_ANNUAL_PRICE_ID",
  "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
  "STRIPE_PRO_OVERAGE_PRICE_ID",
  "STRIPE_BUSINESS_PRICE_ID",
  "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
  "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
  "STRIPE_BUSINESS_OVERAGE_PRICE_ID",
  "STRIPE_VOICE_OVERAGE_METER_EVENT_NAME",
];

console.error("This Stripe setup script is intentionally disabled.");
console.error("Reason: it used the old launch_v2 catalog and could recreate stale tiers.");
console.error("Current launch-v3 env contract:");
for (const key of requiredLaunchV3Env) console.error(`  - ${key}`);
console.error("Run npm run check-prod-env after setting prices in Vercel.");
process.exit(1);
