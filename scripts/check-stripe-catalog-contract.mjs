#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const planCatalogPath = join(root, "src/lib/plan-catalog.ts");
const setupCatalogPath = join(root, "scripts/setup-stripe-catalog.mjs");

const planCatalog = readFileSync(planCatalogPath, "utf8");
const setupCatalog = readFileSync(setupCatalogPath, "utf8");
const errors = [];

const unique = (items) => [...new Set(items)].sort();
const capture = (source, regex) => unique([...source.matchAll(regex)].map((match) => match[1]));

const setupEnvTargets = capture(setupCatalog, /envTarget:\s*"([A-Z0-9_]+)"/g);
const runtimeEnvTargets = capture(
  planCatalog,
  /(?:priceIdEnv|annualPriceIdEnv|extraAgentPriceIdEnv|overagePriceIdEnv):\s*"([A-Z0-9_]+)"/g,
);

const recurringRuntimeEnvTargets = runtimeEnvTargets.filter((name) =>
  /^(?:STRIPE_BUSINESS_STARTER|STRIPE_PRO)_/.test(name),
);

// Only enforce the setup → plan-catalog reference for prices that carry a
// wireline_plan_id in the setup script — those are plan prices. Add-ons
// (e.g. live video) intentionally live outside plan-catalog and are checked
// out via dedicated routes; requiring them to appear in plan-catalog would
// force a bogus reference just to satisfy the contract.
const setupPlanEnvTargets = new Set();
for (const [, , envTarget, metadata] of setupCatalog.matchAll(
  /\{\s*key:\s*"([^"]+)"[\s\S]*?envTarget:\s*"([^"]+)"[\s\S]*?metadata:\s*\{([^}]+)\}/g,
)) {
  if (/wireline_plan_id\s*:\s*"[^"]+"/.test(metadata)) {
    setupPlanEnvTargets.add(envTarget);
  }
}

for (const name of setupEnvTargets) {
  if (setupPlanEnvTargets.has(name) && !runtimeEnvTargets.includes(name)) {
    errors.push(`Catalog setup creates plan price ${name}, but plan-catalog.ts does not reference it.`);
  }
}

for (const name of recurringRuntimeEnvTargets) {
  if (!setupEnvTargets.includes(name)) {
    errors.push(`plan-catalog.ts references recurring price ${name}, but setup-stripe-catalog.mjs does not create it.`);
  }
}

const priceBlocks = [
  ...setupCatalog.matchAll(
    /\{\s*key:\s*"([^"]+)"[\s\S]*?envTarget:\s*"([^"]+)"[\s\S]*?metadata:\s*\{([^}]+)\}/g,
  ),
];

for (const [, key, envTarget, metadata] of priceBlocks) {
  if (!/^(?:STRIPE_BUSINESS_STARTER|STRIPE_PRO)_/.test(envTarget)) continue;

  if (!/wireline_plan_id\s*:\s*"(team|business)"/.test(metadata)) {
    errors.push(`${key} (${envTarget}) must carry wireline_plan_id metadata.`);
  }

  if (!/wireline_price_type\s*:\s*"[^"]+"/.test(metadata)) {
    errors.push(`${key} (${envTarget}) must carry wireline_price_type metadata.`);
  }
}

for (const token of ["wireline_price_key", "wireline_catalog_state", "wireline_catalog_version"]) {
  if (!setupCatalog.includes(token)) {
    errors.push(`setup-stripe-catalog.mjs must write ${token} onto created prices.`);
  }
}

if (errors.length) {
  console.error("Stripe catalog contract check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Stripe catalog contract OK: ${setupEnvTargets.length} setup env targets, ${recurringRuntimeEnvTargets.length} recurring runtime env targets.`,
);
