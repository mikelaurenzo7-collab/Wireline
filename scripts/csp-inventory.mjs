#!/usr/bin/env node
/**
 * csp-inventory.mjs
 * ----------------------------------------------------------------------
 * Counts React `style={{` occurrences per file under src/ and ratchets
 * the total — CI fails if the count rises above the committed baseline.
 *
 * Usage:
 *   node scripts/csp-inventory.mjs          # check (exit 1 on regression)
 *   node scripts/csp-inventory.mjs --update # refresh baseline after intentional reductions
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const srcRoot = join(repoRoot, "src");
const baselinePath = join(__dirname, "csp-inventory-baseline.json");

const PATTERN = /style=\{\{/g;
const EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      entries.push(...walk(full));
    } else if (EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) {
      entries.push(full);
    }
  }
  return entries;
}

function countFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const matches = text.match(PATTERN);
  return matches ? matches.length : 0;
}

function inventory() {
  const files = walk(srcRoot);
  const perFile = {};
  let total = 0;

  for (const file of files) {
    const count = countFile(file);
    if (count > 0) {
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      perFile[rel] = count;
      total += count;
    }
  }

  return { total, perFile, fileCount: Object.keys(perFile).length };
}

const update = process.argv.includes("--update");
const current = inventory();

if (update) {
  const payload = {
    total: current.total,
    fileCount: current.fileCount,
    perFile: current.perFile,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    `csp-inventory: baseline updated — ${current.total} inline styles across ${current.fileCount} files`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  console.error(
    "csp-inventory: missing baseline — run `node scripts/csp-inventory.mjs --update` once to seed it",
  );
  process.exit(1);
}

const issues = [];

if (current.total > baseline.total) {
  issues.push(
    `Total inline style count rose: ${baseline.total} → ${current.total} (+${current.total - baseline.total})`,
  );
}

for (const [file, count] of Object.entries(current.perFile)) {
  const prev = baseline.perFile[file] ?? 0;
  if (count > prev) {
    issues.push(`  ${file}: ${prev} → ${count} (+${count - prev})`);
  }
}

if (issues.length > 0) {
  console.error("csp-inventory: inline style regression detected\n");
  for (const line of issues) console.error(line);
  console.error(
    "\nReduce inline styles or run --update only after an intentional migration phase.",
  );
  process.exit(1);
}

const reduced = baseline.total - current.total;
const suffix = reduced > 0 ? ` (${reduced} below baseline)` : "";
console.log(
  `csp-inventory: OK — ${current.total} inline styles across ${current.fileCount} files${suffix}`,
);
