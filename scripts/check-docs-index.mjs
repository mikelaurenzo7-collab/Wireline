#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const indexPath = "docs/README.md";
const docsIndex = readFileSync(indexPath, "utf8");
const problems = [];

const requiredLinks = [
  "../README.md",
  "../CODEBASE_HEALTH.md",
  "../ARCHITECTURE.md",
  "../DATABASE_SETUP.md",
  "../DEPLOY.md",
  "../AGENTS.md",
  "../CLAUDE.md",
  "./CLIENT_SURFACES.md",
  "./CHATGPT_APP.md",
  "./business-usage-pricing-decision.md",
  "./EXCLUDED_SURFACES_AUDIT_2026-07-06.md",
  "./WIRELINE_LEVEL_UP_MASTER_PLAN.md",
  "./PRODUCT_SHOWCASE_MATRIX.md",
  "./TRUST_CONVERSION_PACK.md",
  "./LAUNCH_READINESS_AND_MARGIN.md",
];

const requiredSections = [
  "## Canonical contracts",
  "## Operating runbooks and current decisions",
  "## Audit evidence and historical snapshots",
  "## Planned work",
  "## Historical / superseded material",
  "## Documentation hygiene rules",
];

for (const link of requiredLinks) {
  if (!docsIndex.includes(`](${link})`)) {
    problems.push(`${indexPath} must link ${link}.`);
  }
}

for (const section of requiredSections) {
  if (!docsIndex.includes(section)) {
    problems.push(`${indexPath} must contain section ${section}.`);
  }
}

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

const markdownFiles = walk("docs")
  .map((file) => file.replace(/\\/g, "/"))
  .filter((file) => file !== indexPath)
  .sort();

for (const file of markdownFiles) {
  const relative = `./${path.relative("docs", file).replace(/\\/g, "/")}`;
  const occurrences = docsIndex.split(`](${relative})`).length - 1;
  if (occurrences === 0) {
    problems.push(`${file} is not indexed from ${indexPath}.`);
  } else if (occurrences > 1) {
    problems.push(`${file} is linked ${occurrences} times from ${indexPath}; link it exactly once.`);
  }
}

const linkedDocs = [...docsIndex.matchAll(/\]\((\.\/[^)]+\.md)\)/g)].map((match) => match[1]);
const duplicateLinks = linkedDocs.filter((link, index) => linkedDocs.indexOf(link) !== index);
for (const link of [...new Set(duplicateLinks)]) {
  problems.push(`${indexPath} contains duplicate link ${link}.`);
}

const activeMarkers = ["Status: **Active", "Status: Active", "**Active** —", "source-of-truth"];
for (const file of markdownFiles) {
  const text = readFileSync(file, "utf8");
  const header = text.slice(0, 1000);
  const claimsActive = activeMarkers.some((marker) => header.includes(marker));
  if (!claimsActive) continue;

  const relative = `./${path.relative("docs", file).replace(/\\/g, "/")}`;
  if (!docsIndex.includes(`](${relative})`)) {
    problems.push(`${file} claims active/canonical status but is not linked from ${indexPath}.`);
  }
}

if (problems.length) {
  console.error("docs index check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`docs index ok (${markdownFiles.length} Markdown files indexed exactly once)`);
