#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const tsconfigPath = path.join(root, "tsconfig.json");
const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
const excludes = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];

// Broad generated/test excludes are intentionally pattern-based. The guard below
// focuses on explicit file paths, where stale entries become real repo debt: a
// deleted file can sit in tsconfig.exclude forever and make the remaining list
// look more intentional than it is.
const allowedPatterns = [
  /^node_modules$/,
  /^src\/\*\*\/\*\.test\.ts$/,
  /^src\/\*\*\/\*\.test\.tsx$/,
  /^src\/\*\*\/__tests__\/\*\*$/,
  /^src\/routes\/vapi\/\*\*$/,
];

const problems = [];

for (const entry of excludes) {
  if (typeof entry !== "string") continue;
  if (allowedPatterns.some((pattern) => pattern.test(entry))) continue;

  // Any new wildcard exclude should be deliberate and reviewed, not hidden
  // behind this file-existence check.
  if (entry.includes("*")) {
    problems.push(
      `- ${entry} is a wildcard exclude not listed in check-tsconfig-exclude-hygiene.mjs.`,
    );
    continue;
  }

  const absolute = path.join(root, entry);
  if (!existsSync(absolute)) {
    problems.push(`- ${entry} does not exist; remove it from tsconfig.exclude.`);
  }
}

if (problems.length) {
  console.error("tsconfig exclude hygiene failed:\n" + problems.join("\n"));
  console.error(
    "\nEither restore the file, remove the stale exclude, or explicitly allow a reviewed pattern.",
  );
  process.exit(1);
}

console.log(`tsconfig exclude hygiene ok (${excludes.length} entries checked)`);
