#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const forbiddenTrackedPathPatterns = [
  /^\.agents\//,
  /^\.cursor\//,
  /^\.grok\//,
  /^\.vercel\//,
  /^\.vscode\//,
  /^\.worktrees\//,
  /^agent-tools\//,
  /^artifacts\//,
  /^coverage\//,
  /^marketing-kit\//,
  /^mcps\//,
  /^official-assets\//,
  /^playwright-report\//,
  /^scratch\//,
  /^terminals\//,
  /^test-results\//,
  /^visual-qa\//,
  /^work\//,
  /^worktrees\//,
  /^stripe-env\.json$/,
  /^public\/(?:og-image|apple-touch-icon|wireline-icon-192)\.png$/,
  /(?:^|\/)grok-(?:exec-summary|review)/,
  /(?:^|\/)\.tmp-/,
  /(?:^|\/)(?:npm-debug|yarn-debug|yarn-error|pnpm-debug)\.log$/,
  /\.(?:bak|backup|orig|rej|tmp|log)$/,
];

function gitLines(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

const trackedFiles = gitLines(["ls-files"]);
const violations = trackedFiles.filter((file) =>
  forbiddenTrackedPathPatterns.some((pattern) => pattern.test(file)),
);

// A tracked file that is also ignored is easy to mistake for local-only state.
// It also means deleting and re-adding a required source file may silently fail.
const ignoredTrackedFiles = gitLines(["ls-files", "-ci", "--exclude-standard"]);

// Git permits case-distinct paths; default macOS and Windows filesystems do not.
// Block collisions before they become checkout or build failures for contributors.
const caseOwners = new Map();
const caseCollisions = [];
for (const file of trackedFiles) {
  const key = file.toLocaleLowerCase("en-US");
  const owner = caseOwners.get(key);
  if (owner && owner !== file) caseCollisions.push(`${owner} <> ${file}`);
  else caseOwners.set(key, file);
}

if (violations.length || ignoredTrackedFiles.length || caseCollisions.length) {
  console.error("Source-control hygiene failed:\n");

  if (violations.length) {
    console.error("Forbidden generated/local artifacts are tracked:");
    for (const file of violations) console.error(`- ${file}`);
  }

  if (ignoredTrackedFiles.length) {
    console.error("\nTracked files also match .gitignore:");
    for (const file of ignoredTrackedFiles) console.error(`- ${file}`);
    console.error(
      "Keep the source file and add a precise negation rule, or remove it from source control if it is generated/local.",
    );
  }

  if (caseCollisions.length) {
    console.error("\nCase-insensitive path collisions:");
    for (const collision of caseCollisions) console.error(`- ${collision}`);
  }

  process.exit(1);
}

console.log(`Source-control hygiene ok (${trackedFiles.length} tracked files checked).`);
