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
  ["starter", 9, 90],
  ["team", 19, 190],
  ["business", 59, 590],
  ["enterprise", 149, 1490],
];
for (const [id, monthly, annual] of expectedPlans) {
  const pattern = new RegExp(
    `id: "${id}"[\\s\\S]{0,240}?price_usd_monthly: ${monthly},[\\s\\S]{0,120}?price_usd_annual: ${annual},`,
  );
  if (!pattern.test(planCatalog)) {
    errors.push(`plan-catalog.ts price drift for ${id}: expected $${monthly}/$${annual}.`);
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

if (errors.length) {
  console.error("Stripe catalog contract check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Stripe Founder catalog contract OK: ${FOUNDER_PRODUCTS.length} products, ${FOUNDER_PRICES.length} prices, ${planEnvTargets.length} plan env targets.`,
);
