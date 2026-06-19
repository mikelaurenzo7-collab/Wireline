#!/usr/bin/env node
/**
 * check-readme-pricing.mjs
 * ----------------------------------------------------------------------
 * Verifies customer-facing docs are in sync with code-owned constants.
 *
 * - README pricing table ↔ src/lib/plan-catalog.ts
 * - README/ARCHITECTURE model copy ↔ src/lib/claude-models.ts
 *
 * Why: the audit found three places where the README told customers one
 * price and the code charged another. Marketing-doc drift is the kind of
 * bug that ends in chargebacks, so we lock it down at CI.
 *
 * Exit code 0 = in sync. Exit code 1 = drift, with a diff printed.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
const architecture = readFileSync(resolve(repoRoot, "ARCHITECTURE.md"), "utf8");
const claudeModelsSource = readFileSync(resolve(repoRoot, "src/lib/claude-models.ts"), "utf8");
const catalogSource = readFileSync(resolve(repoRoot, "src/lib/plan-catalog.ts"), "utf8");
const pricingSource = readFileSync(resolve(repoRoot, "src/pages/Pricing.tsx"), "utf8");
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");

// Extract plan entries from plan-catalog.ts. The file uses literal JS so
// we parse the four numeric fields per tier with a forgiving regex against
// each `{ id: "...", ... }` block. Enterprise's price_usd_monthly: 0 is
// intentional (contact-sales sentinel); the README renders it as "Custom".
const planBlocks = [...catalogSource.matchAll(/\{\s*id:\s*"([\w-]+)"[\s\S]*?\}/g)]
  .map((m) => m[0])
  .filter((b) => /price_usd_monthly:/.test(b));

const plans = planBlocks
  .map((block) => {
    const id = /id:\s*"([^"]+)"/.exec(block)?.[1];
    const name = /name:\s*"([^"]+)"/.exec(block)?.[1];
    const price = /price_usd_monthly:\s*([\d_]+)/.exec(block)?.[1];
    const agents = /max_agents:\s*(\d+)/.exec(block)?.[1];
    const minutes = /voice_minutes_monthly:\s*([\d_]+)/.exec(block)?.[1];
    const overage = /overage_per_min_usd:\s*([0-9.]+)/.exec(block)?.[1];
    const phones = /included_phone_numbers:\s*(\d+)/.exec(block)?.[1];
    if (!id) return null;
    return {
      id,
      label: name ?? id,
      price: price ? Number(price.replace(/_/g, "")) : 0,
      agents: agents ? Number(agents) : 0,
      minutes: minutes ? Number(minutes.replace(/_/g, "")) : 0,
      overage: overage ? Number(overage) : 0,
      phones: phones ? Number(phones) : 0,
    };
  })
  .filter((p) => p && p.id !== "enterprise");

const issues = [];

for (const plan of plans) {
  const label = plan.label;
  // Match the README's en-US comma formatting for prices >= 1000.
  const priceStr = plan.price === 0 ? "Custom" : `$${plan.price.toLocaleString("en-US")}`;
  const overageStr = `$${plan.overage.toFixed(2)}`;

  // README column order: Plan | Price | Minutes | Overage | Agents | Extra agent
  const row = new RegExp(
    `\\|\\s*\\*\\*${escapeRe(label)}\\*\\*\\s*\\|\\s*${escapeRe(priceStr)}\\s*\\|\\s*${plan.minutes.toLocaleString("en-US")}\\s*\\|\\s*${escapeRe(overageStr)}\\s*\\|\\s*${plan.agents}\\s*\\|`,
  );
  if (!row.test(readme)) {
    issues.push(
      `❌  ${label} row missing/out of sync. Expected: ` +
        `| **${label}** | ${priceStr} | ${plan.agents} | ${plan.minutes.toLocaleString("en-US")} | ${overageStr} | ${plan.phones} |`,
    );
  }

  const jsonLdOffer = new RegExp(
    `"name":\\s*"${escapeRe(label)}"[\\s\\S]*?"price":\\s*"${plan.price}"[\\s\\S]*?"url":\\s*"https://trywireline.com/(?:get-started\\?plan=${plan.id}|contact\\?intent=sales)`,
  );
  if (!jsonLdOffer.test(indexHtml)) {
    issues.push(`❌  index.html JSON-LD offer missing/out of sync for ${label}.`);
  }
}

if (!/import\s*\{[^}]*STRIPE_PLANS/.test(pricingSource)) {
  issues.push("❌  Pricing.tsx must import STRIPE_PLANS from plan-catalog.ts");
}
if (!/STRIPE_PLANS\.map/.test(pricingSource)) {
  issues.push("❌  Pricing.tsx must render tiers from STRIPE_PLANS.map()");
}
for (const plan of plans) {
  const priceToken = plan.price === 0 ? "Custom" : `$${plan.price.toLocaleString("en-US")}`;
  if (!pricingSource.includes(priceToken) && !pricingSource.includes(`$${plan.price}`)) {
    issues.push(`❌  Pricing.tsx missing visible price for ${plan.label}: ${priceToken}`);
  }
}

checkClaudeModelDocs();
checkStaleMarketingPricing();

// Cross-check: README must declare $0.X / min overage values for personal
// and starter that match the catalog. Catches the older drift where
// README said "$0.20 / $0.18 / $0.16" while the catalog had moved.
for (const plan of plans) {
  const overageLine = new RegExp(
    `(Personal|Starter|Pro|Business)\\s*\\$${plan.overage.toFixed(2)}\\s*/\\s*min`,
    "i",
  );
  // Allow either presence in the inline list OR the table — both formats appear.
  if (!new RegExp(`\\$${plan.overage.toFixed(2)}`).test(readme)) {
    issues.push(
      `❌  README never mentions $${plan.overage.toFixed(2)}/min (${plan.id} overage rate).`,
    );
  }
  void overageLine; // intentionally not enforced — table form is the source.
}

if (issues.length > 0) {
  console.error("📛  Documentation drift detected:\n");
  for (const i of issues) console.error("  " + i);
  console.error(
    "\n  Edit the docs or their source-of-truth constants so README.md, ARCHITECTURE.md, plan-catalog.ts, and claude-models.ts agree.",
  );
  process.exit(1);
}

console.log("✅  README pricing table and Claude model docs match source constants");
process.exit(0);

function checkClaudeModelDocs() {
  const voiceModelKey = extractAssignedClaudeModelKey("VAPI_TENANT_DEFAULT_MODEL");
  const reasoningModelKey = extractAssignedClaudeModelKey("CLAUDE_REASONING_MODEL_DEFAULT");
  const voiceModelName = displayNameForClaudeModel(extractClaudeModelId(voiceModelKey));
  const reasoningModelName = displayNameForClaudeModel(extractClaudeModelId(reasoningModelKey));

  const requiredMentions = [
    { docName: "README.md", source: readme, modelName: voiceModelName, layer: "voice runtime" },
    {
      docName: "README.md",
      source: readme,
      modelName: reasoningModelName,
      layer: "reasoning default",
    },
    {
      docName: "ARCHITECTURE.md",
      source: architecture,
      modelName: voiceModelName,
      layer: "voice runtime",
    },
    {
      docName: "ARCHITECTURE.md",
      source: architecture,
      modelName: reasoningModelName,
      layer: "reasoning default",
    },
  ];

  for (const mention of requiredMentions) {
    if (!mention.source.includes(mention.modelName)) {
      issues.push(
        `❌  ${mention.docName} missing ${mention.layer} model from src/lib/claude-models.ts: ${mention.modelName}.`,
      );
    }
  }

  const priorOpusName = displayNameForClaudeModel(extractClaudeModelId("OPUS_4_7"));
  if (readme.includes(priorOpusName)) {
    issues.push(
      `❌  README.md still mentions ${priorOpusName}; README should describe the current reasoning default ${reasoningModelName}.`,
    );
  }

  const architectureLines = architecture.split(/\r?\n/);
  architectureLines.forEach((line, index) => {
    if (!line.includes(priorOpusName)) return;
    if (!/(prior|previous|historical|deprecated|legacy|formerly|old|took|routinely)/i.test(line)) {
      issues.push(
        `❌  ARCHITECTURE.md line ${index + 1} mentions ${priorOpusName} without historical/deprecated context.`,
      );
    }
  });
}

function extractAssignedClaudeModelKey(exportName) {
  const assignment = new RegExp(
    `export\\s+const\\s+${escapeRe(exportName)}(?::[^=]+)?=([\\s\\S]*?);`,
  ).exec(claudeModelsSource)?.[1];
  if (!assignment) {
    issues.push(`❌  Unable to find ${exportName} in src/lib/claude-models.ts.`);
    return "";
  }

  const modelKey = /CLAUDE_MODELS\.(\w+)/.exec(assignment)?.[1];
  if (!modelKey) {
    issues.push(`❌  Unable to resolve ${exportName} to a CLAUDE_MODELS key.`);
    return "";
  }
  return modelKey;
}

function extractClaudeModelId(modelKey) {
  const modelId = new RegExp(`${escapeRe(modelKey)}:\\s*"([^"]+)"`).exec(claudeModelsSource)?.[1];
  if (!modelId) {
    issues.push(`❌  Unable to find CLAUDE_MODELS.${modelKey} in src/lib/claude-models.ts.`);
    return "";
  }
  return modelId;
}

function displayNameForClaudeModel(modelId) {
  const match = /^claude-(haiku|sonnet|opus)-(\d+)-(\d+)$/.exec(modelId);
  if (!match) {
    issues.push(`❌  Unable to format Claude model id ${modelId}.`);
    return modelId;
  }
  const family = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return `Claude ${family} ${match[2]}.${match[3]}`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Scan in-app marketing copy for legacy launch_v2 price points. */
function checkStaleMarketingPricing() {
  const srcRoot = resolve(repoRoot, "src");
  const banned = [
    { re: /\$49\/mo/gi, hint: "Personal starts at $9/mo (see plan-catalog.ts)" },
    { re: /\$49\/month/gi, hint: "Personal starts at $9/mo (see plan-catalog.ts)" },
    { re: /personal:\s*49\b/gi, hint: "Use STRIPE_PLANS / plan-catalog for checkout analytics" },
    {
      re: /\*\*Business Starter\*\*\s*\|\s*\$79\b/gi,
      hint: "Business Starter is $99/mo in plan-catalog.ts",
    },
    { re: /Business Starter[^\n$]{0,40}\$79\/mo/gi, hint: "Business Starter is $99/mo" },
  ];

  const files = collectSourceFiles(srcRoot);
  for (const file of files) {
    if (file.endsWith("plan-catalog.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const rule of banned) {
      rule.re.lastIndex = 0;
      if (rule.re.test(text)) {
        issues.push(`❌  Stale pricing in ${relative(repoRoot, file)}: ${rule.hint}`);
      }
    }
  }
}

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules") continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function relative(from, to) {
  return to.replace(from, "").replace(/^[/\\]/, "");
}
