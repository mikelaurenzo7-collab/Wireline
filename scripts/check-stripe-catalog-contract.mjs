#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FOUNDER_CATALOG_VERSION,
  FOUNDER_PRICES,
  FOUNDER_PRODUCTS,
} from "./lib/stripe-founder-catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const planCatalog = read("src/lib/plan-catalog.ts");
const setupCatalog = read("scripts/setup-stripe-catalog.mjs");
const auditCatalog = read("scripts/audit-stripe-catalog-live.mjs");
const packageJson = JSON.parse(read("package.json"));
const errors = [];

function requireText(source, token, message) {
  if (!source.includes(token)) errors.push(message);
}

requireText(
  planCatalog,
  `FOUNDER_CATALOG_VERSION = "${FOUNDER_CATALOG_VERSION}"`,
  "plan-catalog.ts must use the shared Founder catalog version.",
);
requireText(
  setupCatalog,
  'from "./lib/stripe-founder-catalog.mjs"',
  "Stripe setup must import the shared Founder catalog manifest.",
);
requireText(
  auditCatalog,
  'from "./lib/stripe-founder-catalog.mjs"',
  "Stripe live audit must import the shared Founder catalog manifest.",
);

if (packageJson.scripts?.["stripe:setup"] !== "node scripts/setup-stripe-catalog.mjs") {
  errors.push("stripe:setup must run the Founder catalog reconciler.");
}
if (packageJson.scripts?.["stripe:catalog:check"] !== "node scripts/check-stripe-catalog-contract.mjs") {
  errors.push("stripe:catalog:check must run this contract.");
}

const planEnvTargets = FOUNDER_PRICES.filter(
  (price) => price.envTarget && price.metadata?.wireline_plan_id,
).map((price) => price.envTarget);

for (const envTarget of planEnvTargets) {
  requireText(
    planCatalog,
    `"${envTarget}"`,
    `plan-catalog.ts does not reference canonical price env ${envTarget}.`,
  );
}

for (const envTarget of ["STRIPE_EXTRA_AGENT_PRICE_ID"]) {
  requireText(
    planCatalog,
    `"${envTarget}"`,
    `plan-catalog.ts does not reference canonical add-on env ${envTarget}.`,
  );
}

const expectedPlans = [
  ["starter", 19, 190],
  ["team", 39, 390],
  ["business", 79, 790],
  ["enterprise", 159, 1590],
];
for (const [id, monthly, annual] of expectedPlans) {
  const pattern = new RegExp(
    `id: "${id}"[\\s\\S]{0,240}?price_usd_monthly: ${monthly},[\\s\\S]{0,120}?price_usd_annual: ${annual},`,
  );
  if (!pattern.test(planCatalog)) {
    errors.push(`plan-catalog.ts price drift for ${id}: expected $${monthly}/$${annual}.`);
  }
}

const expectedCapacity = [
  ["starter", 1, 1, 60],
  ["team", 2, 2, 120],
  ["business", 5, 5, 245],
  ["enterprise", 15, 15, 450],
];
for (const [planId, agents, numbers, voiceMinutes] of expectedCapacity) {
  const product = FOUNDER_PRODUCTS.find(
    (candidate) => candidate.metadata?.wireline_plan_id === planId,
  );
  if (!product) {
    errors.push(`Founder manifest is missing product metadata for ${planId}.`);
    continue;
  }

  const expectedMetadata = {
    included_agents: String(agents),
    included_numbers: String(numbers),
    included_voice_minutes: String(voiceMinutes),
    overage_policy: "prepaid_balance_only",
  };
  for (const [key, value] of Object.entries(expectedMetadata)) {
    if (product.metadata?.[key] !== value) {
      errors.push(`Founder product metadata drift for ${planId}.${key}: expected ${value}.`);
    }
  }

  const recurringPrices = FOUNDER_PRICES.filter(
    (price) => price.productKey === planId && price.recurring,
  );
  if (recurringPrices.length !== 2) {
    errors.push(`Founder manifest must define monthly and annual prices for ${planId}.`);
  }
  for (const price of recurringPrices) {
    if (price.metadata?.included_voice_minutes !== String(voiceMinutes)) {
      errors.push(
        `Founder price metadata drift for ${price.key}: expected ${voiceMinutes} included minutes.`,
      );
    }
  }
}

const extraAgentProduct = FOUNDER_PRODUCTS.find((product) => product.key === "extra_agent");
const extraAgentPrice = FOUNDER_PRICES.find(
  (price) => price.key === "extra_agent_monthly_founder_2026_07_v3",
);
for (const [label, metadata] of [
  ["product", extraAgentProduct?.metadata],
  ["price", extraAgentPrice?.metadata],
]) {
  if (metadata?.included_voice_minutes !== "50" || metadata?.included_phone_numbers !== "1") {
    errors.push(`Extra-agent ${label} metadata must guarantee 50 minutes and one number slot.`);
  }
}

if (FOUNDER_PRODUCTS.length !== 8) {
  errors.push(`Founder manifest must define 8 active paid/add-on products; found ${FOUNDER_PRODUCTS.length}.`);
}
if (FOUNDER_PRICES.length !== 14) {
  errors.push(`Founder manifest must define 14 active prices; found ${FOUNDER_PRICES.length}.`);
}

for (const [source, label] of [
  [setupCatalog, "Stripe setup"],
  [auditCatalog, "Stripe live audit"],
]) {
  requireText(
    source,
    'status: "all"',
    `${label} must inspect every Stripe subscription status before catalog cleanup.`,
  );
  requireText(
    source,
    '"incomplete_expired"',
    `${label} must distinguish terminal from nonterminal subscriptions.`,
  );
}

for (const retiredToken of [
  "Wireline Team - Monthly",
  "Wireline Business - Monthly",
  "team_voice_overage",
  "business_voice_overage",
  "VOICE_OVERAGE_METER_EVENT_NAME",
]) {
  if (setupCatalog.includes(retiredToken) || auditCatalog.includes(retiredToken)) {
    errors.push(`Stripe maintenance scripts still contain retired catalog token: ${retiredToken}.`);
  }
}

requireText(
  setupCatalog,
  "No postpaid voice-overage price is created.",
  "Stripe setup must preserve the prepaid-overflow guardrail.",
);
requireText(
  auditCatalog,
  "Superseded Wireline price is still active.",
  "Stripe audit must reject active superseded prices.",
);

// The generated-env pipeline must be version-guarded end to end: the writer
// stamps the catalog version, and both consumers refuse a mismatched file, so
// a stale local .stripe-env.generated.json can never push or "verify" retired
// price ids against live Vercel. No blind fallback env map may reappear.
const setupScript = read("scripts/setup-stripe-catalog.mjs");
const syncScript = read("scripts/sync-stripe-env-to-vercel.mjs");
const parityScript = read("scripts/verify-stripe-vercel-parity.mjs");
requireText(
  setupScript,
  "wireline_catalog_version: FOUNDER_CATALOG_VERSION",
  "setup-stripe-catalog must stamp the generated env file with the catalog version.",
);
for (const [name, source] of [
  ["sync-stripe-env-to-vercel", syncScript],
  ["verify-stripe-vercel-parity", parityScript],
]) {
  requireText(
    source,
    "wireline_catalog_version",
    `${name} must refuse a generated env file whose catalog version mismatches the code.`,
  );
}
if (syncScript.includes("FALLBACK_ENV") || syncScript.includes("STRIPE_BUSINESS_STARTER_PRICE_ID")) {
  errors.push(
    "sync-stripe-env-to-vercel must not carry a fallback env map of retired price-id names.",
  );
}

if (errors.length) {
  console.error("Stripe catalog contract check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Stripe Founder catalog contract OK: ${FOUNDER_PRODUCTS.length} products, ${FOUNDER_PRICES.length} prices, ${planEnvTargets.length} plan env targets.`,
);
