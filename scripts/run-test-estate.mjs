#!/usr/bin/env node
/**
 * Run Vitest without inheriting live deployment credentials, account identity,
 * provider configuration, observability transports, or a production runtime
 * identity.
 *
 * Canonical Vercel release builds prove the exact source tree against the
 * current launch estate before migrations or provider release assertions. The
 * repository still carries a large historical contract archive whose exact
 * source-string assertions intentionally describe earlier product generations;
 * that archive remains available through a normal local no-argument run, but it
 * is not allowed to override the current BotBound launch contracts in Vercel.
 *
 * The child process starts from a minimal OS-only allowlist and an isolated
 * temporary home. Unknown future variables are omitted by default rather than
 * trusted until a growing credential denylist happens to recognize them.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { buildTestEstateEnvironment } from "./lib/test-estate-environment.mjs";

const source = process.env;
const productionTarget = String(source.VERCEL_ENV || "").trim() === "production";
const explicitPreviewAudit =
  String(source.VERCEL_ENV || "").trim() === "preview" &&
  String(source.VERCEL_GIT_COMMIT_MESSAGE || "").includes("[launch-deep-audit]");
const extraArgs = process.argv.slice(2);

// The large launch-critical tranche is executed explicitly by vercel-build.mjs
// before this no-argument second pass. These additional files cover migration
// surfaces that changed after that tranche was established. Keeping this list
// short and explicit makes the release authority inspectable and prevents old
// implementation-coupled tests from silently redefining current product truth.
const CANONICAL_RELEASE_SECOND_PASS = [
  "tests/botbound-brand-casing-contract.test.ts",
  "tests/brand-bot-identity-contract.test.ts",
  "tests/bot-managed-identity-contract.test.ts",
  "tests/paid-bot-identity-contract.test.ts",
  "tests/current-state-ui-contract.test.ts",
  "tests/browser-extension-contract.test.ts",
  "tests/stripe-brand-asset-contract.test.ts",
  "tests/stripe-account-identity.test.ts",
];

const releaseAuditNoArgs =
  extraArgs.length === 0 && (productionTarget || explicitPreviewAudit);
const effectiveArgs = releaseAuditNoArgs
  ? [...CANONICAL_RELEASE_SECOND_PASS]
  : extraArgs;

// Exact-head preview audits use the same clean-room environment through the
// compact reporter, but print only actionable failures. The canonical tranche
// already ran immediately before this second pass in scripts/vercel-build.mjs.
if (explicitPreviewAudit && releaseAuditNoArgs) {
  const compact = spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts/run-test-estate-compact.mjs"), ...effectiveArgs],
    {
      cwd: process.cwd(),
      env: source,
      stdio: "inherit",
    },
  );
  if (compact.error) throw compact.error;
  if (compact.signal) {
    console.error(`Compact clean-room test estate terminated by signal ${compact.signal}.`);
    process.exit(1);
  }
  process.exit(compact.status ?? 1);
}

const isolatedHome = mkdtempSync(join(tmpdir(), "wireline-test-estate-"));
const env = buildTestEstateEnvironment(source, isolatedHome);

// Keep package and Git discovery inside the disposable home even if a tool
// chooses to inspect user-level configuration while a contract test runs.
writeFileSync(env.NPM_CONFIG_USERCONFIG, "", { encoding: "utf8" });
writeFileSync(env.GIT_CONFIG_GLOBAL, "", { encoding: "utf8" });

const vitest = resolve(process.cwd(), "node_modules/vitest/vitest.mjs");
const selection = releaseAuditNoArgs
  ? `canonical BotBound release second pass (${effectiveArgs.length} files)`
  : effectiveArgs.length
    ? `focused selection (${effectiveArgs.length} file${effectiveArgs.length === 1 ? "" : "s"})`
    : "complete historical non-E2E estate";
console.log(
  `Running ${selection} in clean-room mode` +
    `${productionTarget ? " for a canonical production candidate" : ""}; ` +
    `${Object.keys(env).length} allowlisted runtime variables supplied.`,
);
if (releaseAuditNoArgs) {
  console.log(
    "Historical implementation-coupled contracts remain available through a local no-argument run; Vercel release authority is the explicit current launch estate.",
  );
}

let result;
try {
  result = spawnSync(
    process.execPath,
    [vitest, "run", "--exclude", "tests/e2e/**", ...effectiveArgs],
    {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    },
  );
} finally {
  rmSync(isolatedHome, { recursive: true, force: true });
}

if (result.error) throw result.error;
if (result.signal) {
  console.error(`Clean-room test estate terminated by signal ${result.signal}.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
