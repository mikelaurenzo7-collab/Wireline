#!/usr/bin/env node
/**
 * Disabled guard.
 *
 * Do not run automated Stripe catalog writes from this repo until the new
 * Personal / Team / Business / Enterprise catalog and Conversation Balance
 * top-up model are approved end-to-end. Use scripts/setup-stripe-catalog.mjs
 * to generate the proposal manifest instead.
 */

const requiredEnv = [
  "STRIPE_PERSONAL_PRICE_ID",
  "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
  "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
  "STRIPE_PERSONAL_OVERAGE_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_ANNUAL_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_EXTRA_AGENT_PRICE_ID",
  "STRIPE_PERSONAL_PLUS_OVERAGE_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID",
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
console.error("Generate the proposal manifest with node scripts/setup-stripe-catalog.mjs.");
console.error("Current env contract:");
for (const key of requiredEnv) console.error(`  - ${key}`);
process.exit(1);
