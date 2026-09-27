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
if (
  packageJson.scripts?.["stripe:catalog:check"] !== "node scripts/check-stripe-catalog-contract.mjs"
) {
  errors.push("stripe:catalog:check must run this contract.");
}

const { tsImport } = await import("tsx/esm/api");
const { STRIPE_PLANS } = await tsImport("../src/lib/plan-catalog.ts", import.meta.url);
const expectedPlans = STRIPE_PLANS.filter(
  (plan) => plan.price_usd_monthly > 0 && plan.checkoutAvailability === "available",
);
const planEnvTargets = [];
for (const plan of expectedPlans) {
  const product = FOUNDER_PRODUCTS.find((item) => item.key === plan.id);
  if (!product || product.name !== plan.name)
    errors.push(`Missing or incorrect product for ${plan.id}.`);
  const metadata = {
    included_agents: plan.max_agents,
    included_numbers: plan.included_phone_numbers,
    included_mailboxes: plan.included_mailboxes,
    included_voice_minutes: plan.voice_minutes_monthly,
    included_ai_spend_usd: plan.ai_spend_allowance_usd_monthly,
  };
  for (const [key, value] of Object.entries(metadata)) {
    if (Number(product?.metadata?.[key]) !== value) errors.push(`${plan.id} product ${key} drift.`);
  }
  if (product?.metadata?.wireline_channels !== plan.channels.join(","))
    errors.push(`${plan.id} channel metadata drift.`);
  for (const interval of ["month", "year"]) {
    const annual = interval === "year";
    const key = annual ? plan.lookupKeyAnnual : plan.lookupKeyMonthly;
    const price = FOUNDER_PRICES.find((item) => item.lookupKey === key);
    const envTarget = annual ? plan.annualPriceIdEnv : plan.priceIdEnv;
    planEnvTargets.push(envTarget);
    if (
      !price ||
      price.unitAmount !== (annual ? plan.price_usd_annual : plan.price_usd_monthly) * 100 ||
      price.envTarget !== envTarget ||
      price.recurring?.interval !== interval ||
      price.metadata?.wireline_plan_id !== plan.id
    )
      errors.push(`${plan.id} ${interval} price drift.`);
  }
}
if (
  FOUNDER_PRICES.some(
    (price) =>
      price.recurring &&
      !expectedPlans.some((plan) => plan.id === price.metadata?.wireline_plan_id),
  )
)
  errors.push("Unavailable/legacy packages must not receive new prices.");
requireText(
  setupCatalog,
  "isHistoricalCatalogObject",
  "Setup must preserve historical Stripe objects.",
);

// Live Video was retired on 2026-08-17. Keeping it in this active manifest
// would cause stripe:setup to reactivate the archived product and price.
if (
  FOUNDER_PRODUCTS.some((product) => product.key === "live_video") ||
  FOUNDER_PRICES.some((price) => price.key === "live_video_monthly")
) {
  errors.push("Retired Live Video must stay out of the active Founder Stripe manifest.");
}

// Commercial Stripe copy follows the same Bot taxonomy as the application.
for (const product of FOUNDER_PRODUCTS) {
  if (
    /\bvoice agents?\b|\blive agents?\b|\b\d+\+ agents\b/i.test(
      `${product.name} ${product.description}`,
    )
  ) {
    errors.push(`Founder Stripe product still exposes retired Agent taxonomy: ${product.key}.`);
  }
}
for (const price of FOUNDER_PRICES) {
  if (/\bExtra Agent\b/i.test(price.nickname || "")) {
    errors.push(`Founder Stripe price still exposes retired Agent taxonomy: ${price.key}.`);
  }
}

if (FOUNDER_PRODUCTS.length !== expectedPlans.length + 2) {
  errors.push(
    `Founder manifest must define ${expectedPlans.length + 2} active channel/contact/balance products; found ${FOUNDER_PRODUCTS.length}.`,
  );
}
if (FOUNDER_PRICES.length !== expectedPlans.length * 2 + 4) {
  errors.push(
    `Founder manifest must define ${expectedPlans.length * 2 + 4} active prices; found ${FOUNDER_PRICES.length}.`,
  );
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
if (
  syncScript.includes("FALLBACK_ENV") ||
  syncScript.includes("STRIPE_BUSINESS_STARTER_PRICE_ID")
) {
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
