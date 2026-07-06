#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const forbiddenTrackedPathPatterns = [
  /^\.agents\//,
  /^\.cursor\//,
  /^\.grok\//,
  /^\.vercel\//,
  /^\.vscode\//,
  /^artifacts\//,
  /^coverage\//,
  /^playwright-report\//,
  /^test-results\//,
  /^stripe-env\.json$/,
  /^public\/wireline-icon-192\.png$/,
  /(?:^|\/)grok-(?:exec-summary|review)/,
  /(?:^|\/)\.tmp-/,
  /\.(?:bak|backup|orig|rej|tmp|log)$/,
];

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const violations = trackedFiles.filter((file) =>
  forbiddenTrackedPathPatterns.some((pattern) => pattern.test(file)),
);

if (violations.length) {
  console.error("source-control hygiene failed: forbidden generated/local artifacts are tracked");
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  console.error(
    "\nRemove these files from git, or narrow the hygiene rule if a durable source file was misclassified.",
  );
  process.exit(1);
}

console.log(`source-control hygiene ok (${trackedFiles.length} tracked files checked)`);
