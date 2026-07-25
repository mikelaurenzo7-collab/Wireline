#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const docsIndex = readFileSync("docs/README.md", "utf8");
const required = [
  "../README.md",
  "../CODEBASE_HEALTH.md",
  "../ARCHITECTURE.md",
  "./CLIENT_SURFACES.md",
  "./CHATGPT_APP.md",
  "./business-usage-pricing-decision.md",
  "./EXCLUDED_SURFACES_AUDIT_2026-07-06.md",
  "./WIRELINE_LEVEL_UP_MASTER_PLAN.md",
  "./PRODUCT_SHOWCASE_MATRIX.md",
  "./TRUST_CONVERSION_PACK.md",
  "./LAUNCH_READINESS_AND_MARGIN.md",
];
const problems = [];
for (const link of required) {
  if (!docsIndex.includes(link)) problems.push(`docs/README.md must link ${link}.`);
}

const activeMarkers = ["Status: **Active", "Status: Active", "**Active** —", "source-of-truth"];
function walk(dir) {
  const entries = [];
  for (const item of readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = statSync(full);
    if (stat.isDirectory()) entries.push(...walk(full));
    else if (item.endsWith(".md")) entries.push(full);
  }
  return entries;
}

for (const file of walk("docs")) {
  const rel = file.replace(/\\/g, "/");
  const text = readFileSync(file, "utf8");
  const header = text.slice(0, 800);
  const claimsActive = activeMarkers.some((marker) => header.includes(marker));
  if (claimsActive && rel !== "docs/README.md") {
    const indexLink = `./${path.relative("docs", rel).replace(/\\/g, "/")}`;
    if (!docsIndex.includes(indexLink)) {
      problems.push(`${rel} has active/canonical language but is not linked from docs/README.md.`);
    }
  }
}

if (problems.length) {
  console.error("docs index check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log("docs index ok");
