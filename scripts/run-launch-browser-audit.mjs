#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const BROWSER_AUDIT_TAG = "[launch-browser-audit]";
const BROWSER_CAPABILITY_FLAG = "WIRELINE_BROWSER_AUDIT_CAPABLE";
const TESTS = [
  "tests/e2e/marketing-viewport-lock.spec.ts",
  "tests/e2e/marketing-a11y.spec.ts",
  "tests/e2e/public-demo-fallback.spec.ts",
];

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function runLaunchBrowserAuditIfRequested() {
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const commitMessage = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "");
  if (environment !== "preview" || !commitMessage.includes(BROWSER_AUDIT_TAG)) return;

  if (process.env[BROWSER_CAPABILITY_FLAG] !== "true") {
    console.warn(
      "Browser audit requested but not executed: set WIRELINE_BROWSER_AUDIT_CAPABLE=true only on a runner with Chromium system libraries and network access to the preview. Source, security, unit, and build certification continue independently.",
    );
    console.warn("WIRELINE_BROWSER_AUDIT_RESULT=SKIPPED_RUNNER_UNAVAILABLE");
    return;
  }

  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || "/tmp/wireline-playwright";
  const auditEnv = {
    ...process.env,
    CI: "1",
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  };

  console.log(
    "Running one-shot Chromium E2E launch audit: responsive marketing geometry, accessibility, and protected-demo fallback.",
  );
  console.log(`Installing the pinned Chromium build under ${browsersPath}.`);
  run("npx", ["playwright", "install", "chromium"], auditEnv);
  run(
    "npx",
    ["playwright", "test", ...TESTS, "--project=chromium", "--reporter=line"],
    auditEnv,
  );
  console.log("WIRELINE_BROWSER_AUDIT_RESULT=PASSED");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLaunchBrowserAuditIfRequested();
}
