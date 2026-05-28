#!/usr/bin/env node
/**
 * check-readme-pricing.mjs
 * ----------------------------------------------------------------------
 * Verifies the README pricing table is in sync with src/lib/plan-catalog.ts.
 *
 * Why: the audit found three places where the README told customers one
 * price and the code charged another. Marketing-doc drift is the kind of
 * bug that ends in chargebacks, so we lock it down at CI.
 *
 * Exit code 0 = in sync. Exit code 1 = drift, with a diff printed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
const catalogSource = readFileSync(resolve(repoRoot, "src/lib/plan-catalog.ts"), "utf8");
const pricingSource = readFileSync(resolve(repoRoot, "src/pages/Pricing.tsx"), "utf8");
const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");

// Extract plan entries from plan-catalog.ts. The file uses literal JS so
// we parse the four numeric fields per tier with a forgiving regex against
// each `{ id: "...", ... }` block. Enterprise's price_usd_monthly: 0 is
// intentional (contact-sales sentinel); the README renders it as "Custom".
const planBlocks = [...catalogSource.matchAll(/\{\s*id:\s*"(\w+)"[\s\S]*?\}/g)]
  .map((m) => m[0])
  .filter((b) => /price_usd_monthly:/.test(b));

const plans = planBlocks
  .map((block) => {
    const id = /id:\s*"(\w+)"/.exec(block)?.[1];
    const price = /price_usd_monthly:\s*([\d_]+)/.exec(block)?.[1];
    const agents = /max_agents:\s*(\d+)/.exec(block)?.[1];
    const minutes = /voice_minutes_monthly:\s*([\d_]+)/.exec(block)?.[1];
    const overage = /overage_per_min_usd:\s*([0-9.]+)/.exec(block)?.[1];
    const phones = /included_phone_numbers:\s*(\d+)/.exec(block)?.[1];
    if (!id) return null;
    return {
      id,
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
  const label = plan.id.charAt(0).toUpperCase() + plan.id.slice(1);
  // Match the README's en-US comma formatting for prices >= 1000.
  const priceStr = `$${plan.price.toLocaleString("en-US")}`;
  const overageStr = `$${plan.overage.toFixed(2)}`;

  // README pricing table row looks like:
  // | **Personal** | $49 | 1 | 400 | $0.20 | 1 |
  const row = new RegExp(
    `\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*${escapeRe(priceStr)}\\s*\\|\\s*${plan.agents}\\s*\\|\\s*${plan.minutes.toLocaleString("en-US")}\\s*\\|\\s*${escapeRe(overageStr)}\\s*\\|\\s*${plan.phones}\\s*\\|`,
  );
  if (!row.test(readme)) {
    issues.push(
      `❌  ${label} row missing/out of sync. Expected: ` +
        `| **${label}** | ${priceStr} | ${plan.agents} | ${plan.minutes.toLocaleString("en-US")} | ${overageStr} | ${plan.phones} |`,
    );
  }

  const pricingExpectations = [
    { label: "price", value: priceStr },
    { label: "agents", value: `${plan.agents} AI voice agent${plan.agents === 1 ? "" : "s"}` },
    { label: "minutes", value: `${plan.minutes.toLocaleString("en-US")} voice minutes` },
    { label: "overage", value: `Overage at ${overageStr} / min` },
    {
      label: "numbers",
      value: `${plan.phones} dedicated voice number${plan.phones === 1 ? "" : "s"} INCLUDED`,
    },
  ];
  for (const expectation of pricingExpectations) {
    if (!pricingSource.includes(expectation.value)) {
      issues.push(`❌  Pricing.tsx missing ${label} ${expectation.label}: ${expectation.value}`);
    }
  }

  const jsonLdOffer = new RegExp(
    `"name":\\s*"${label}"[\\s\\S]*?"price":\\s*"${plan.price}"[\\s\\S]*?"url":\\s*"https://trywireline.com/signup\\?plan=${plan.id}"`,
  );
  if (!jsonLdOffer.test(indexHtml)) {
    issues.push(`❌  index.html JSON-LD offer missing/out of sync for ${label}.`);
  }
}

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
  console.error("📛  README pricing is out of sync with plan-catalog.ts:\n");
  for (const i of issues) console.error("  " + i);
  console.error(
    "\n  Edit /app/README.md (or /app/src/lib/plan-catalog.ts) so the table and the catalog agree.",
  );
  process.exit(1);
}

console.log("✅  README pricing table matches src/lib/plan-catalog.ts");
process.exit(0);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
