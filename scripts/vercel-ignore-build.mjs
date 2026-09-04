#!/usr/bin/env node
/**
 * Skip Vercel compute only when every change since the last successful
 * deployment is provably documentation, test, workflow, native-client, or
 * film-source-only. Any uncertainty builds.
 * Exit 0 means "ignore" to Vercel; exit 1 means "continue the build".
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NON_RUNTIME_PREFIXES = [
  "docs/",
  "tests/",
  ".github/",
  "android/",
  "ios/",
  "apps/botbound-film/",
];

export function isNonRuntimeOnlyPath(file) {
  const normalized = String(file || "")
    .trim()
    .replaceAll("\\", "/");
  if (!normalized) return false;
  if (!normalized.includes("/") && normalized.toLowerCase().endsWith(".md")) return true;
  return NON_RUNTIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isIgnorableChangeSet(files) {
  return files.length > 0 && files.every(isNonRuntimeOnlyPath);
}

export function isExplicitBuildRequested(environment = process.env) {
  return String(environment.VERCEL_GIT_COMMIT_MESSAGE || "").includes("[launch-deep-audit]");
}

export function resolveVercelDiffRange(environment = process.env) {
  const previousSha = String(environment.VERCEL_GIT_PREVIOUS_SHA || "").trim();
  if (!/^[0-9a-f]{40}$/i.test(previousSha)) return null;
  return [previousSha, "HEAD"];
}

function changedFiles(environment = process.env) {
  const diffRange = resolveVercelDiffRange(environment);
  if (!diffRange) return null;
  const result = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", ...diffRange],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) return null;
  return result.stdout
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function main() {
  if (isExplicitBuildRequested()) {
    console.log("Vercel build retained: [launch-deep-audit] explicitly requested exact-head certification.");
    process.exitCode = 1;
    return;
  }

  const files = changedFiles();
  if (!files) {
    console.log(
      "Vercel build retained: the last successful deployment diff could not be proven safe to ignore.",
    );
    process.exitCode = 1;
    return;
  }
  if (!isIgnorableChangeSet(files)) {
    console.log("Vercel build retained: deployable or infrastructure files changed.");
    process.exitCode = 1;
    return;
  }
  console.log(`Vercel build skipped: ${files.length} non-runtime file(s) changed.`);
  process.exitCode = 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
