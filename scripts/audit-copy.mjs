#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const rootsToScan = ["src", "apps/browser-extension", "ios", "android", "public"].filter((path) =>
  existsSync(join(root, path)),
);

const ignoredSegments = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".gradle",
  "Pods",
  "DerivedData",
]);

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".mjs",
  ".svg",
  ".swift",
  ".ts",
  ".tsx",
  ".xml",
]);

const checks = [
  {
    name: "trust-breaking placeholder copy",
    pattern: /\b(product demo|Nothing is mocked|owner@example)\b/i,
  },
  {
    name: "fake phone numbers",
    pattern: /\b555[- )0-9]+\b/,
  },
  {
    name: "fake readiness percentages",
    pattern: /\b\d{1,3}% ready\b/i,
  },
  {
    name: "retired Wire Agent label",
    pattern: /\bWire agent\b/i,
  },
  {
    name: "known invalid Tailwind spacing utility",
    pattern: /(?:^|[\s"'`])(?:sm:)?(?:p-5\.5|py-18)(?=[\s"'`]|$)/,
  },
  {
    name: "scratch/probe artifact",
    pattern: /\b(scratch_canary|probe_canary)\b/i,
  },
];

function shouldSkip(path) {
  return path.split(/[\\/]/).some((segment) => ignoredSegments.has(segment));
}

function hasTextExtension(path) {
  return [...textExtensions].some((ext) => path.endsWith(ext));
}

function walk(dir, files = []) {
  if (!existsSync(dir) || shouldSkip(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (shouldSkip(path)) continue;

    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path, files);
    } else if (stats.isFile() && hasTextExtension(path)) {
      files.push(path);
    }
  }

  return files;
}

const failures = [];

for (const scanRoot of rootsToScan) {
  for (const file of walk(join(root, scanRoot))) {
    const source = readFileSync(file, "utf8");
    for (const check of checks) {
      const match = source.match(check.pattern);
      if (match) {
        failures.push(`${relative(root, file)}: ${check.name} (${match[0]})`);
      }
    }
  }
}

if (failures.length) {
  console.error("Copy and utility audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Copy and utility audit passed");
