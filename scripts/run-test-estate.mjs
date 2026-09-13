#!/usr/bin/env node
/**
 * Run Vitest without inheriting live deployment credentials, account identity,
 * provider configuration, observability transports, or a production runtime
 * identity.
 *
 * Canonical Vercel release builds prove the exact source tree against an
 * explicit current-launch estate before migrations or provider assertions. The
 * repository also carries a historical contract archive whose source-string
 * assertions describe earlier product generations. A no-argument run always
 * executes that complete non-E2E archive; the release-only second pass must be
 * requested explicitly and never hides behind production environment state.
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
const explicitPreviewAudit =
  String(source.VERCEL_ENV || "").trim() === "preview" &&
  String(source.VERCEL_GIT_COMMIT_MESSAGE || "").includes("[launch-deep-audit]");
const extraArgs = process.argv.slice(2);
const canonicalReleaseSecondPass =
  extraArgs.length === 1 && extraArgs[0] === "--canonical-release-second-pass";

// The large launch-critical tranche is executed explicitly by vercel-build.mjs
// before this explicitly selected second pass. These additional files cover
// late release-gate additions and migration surfaces. Keeping this list short
// and explicit makes the release authority inspectable and prevents old
// implementation-coupled tests from silently redefining current product truth.
const CANONICAL_RELEASE_SECOND_PASS = [
  "tests/security-audit-bulk.test.mjs",
  "tests/security-audit-osv-fallback.test.mjs",
  "tests/vercel-ignore-build.test.ts",
  "tests/page-meta-navigation.test.ts",
  "tests/marketing-disclosure.test.tsx",
  "tests/privacy-choices-focus.test.tsx",
  "tests/browser-error-report-privacy.test.ts",
  "tests/paid-bot-identity-capacity.test.ts",
  "tests/paid-bot-identity-admission.test.ts",
  "tests/paid-bot-identity-audit.test.ts",
  "tests/bot-identity-bootstrap.test.ts",
  "tests/managed-identity-routes.test.ts",
  "tests/agentmail-erasure-boundary.test.ts",
  "tests/auth-access-pending.test.tsx",
  "tests/workspace-mobile-section-picker.test.tsx",
  "tests/marketing-signup-continuity.test.tsx",
  "tests/workspace-panel-collapse.test.tsx",
  "tests/route-change-a11y-focus.test.tsx",
  "tests/sms-thread-drafts.test.tsx",
  "tests/authenticated-workspace-design-contract.test.ts",
  "tests/design/agent-navigation-contract.test.ts",
  "tests/design/demand-driven-overview-contract.test.ts",
  "tests/studio-canvas-vision-contract.test.ts",
  "tests/navigation-ia-contract.test.ts",
  "tests/auth-redirect-returning-plan.test.ts",
  "src/lib/signup-intent.test.ts",
  "tests/wireline-create-flow.test.ts",
  "src/lib/billing-checkout-return.test.ts",
  "tests/activation-path-contract.test.ts",
  "tests/botbound-brand-casing-contract.test.ts",
  "tests/brand-bot-identity-contract.test.ts",
  "tests/bot-managed-identity-contract.test.ts",
  "tests/paid-bot-identity-contract.test.ts",
  "tests/current-state-ui-contract.test.ts",
  "tests/browser-extension-contract.test.ts",
  "tests/stripe-brand-asset-contract.test.ts",
  "tests/stripe-account-identity.test.ts",
];

const effectiveArgs = canonicalReleaseSecondPass ? [...CANONICAL_RELEASE_SECOND_PASS] : extraArgs;

// Exact-head preview audits use the same clean-room environment through the
// compact reporter, but print only actionable failures. The canonical tranche
// already ran immediately before this second pass in scripts/vercel-build.mjs.
if (explicitPreviewAudit && canonicalReleaseSecondPass) {
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
const selection = canonicalReleaseSecondPass
  ? `canonical BotBound release second pass (${effectiveArgs.length} files)`
  : effectiveArgs.length
    ? `focused selection (${effectiveArgs.length} file${effectiveArgs.length === 1 ? "" : "s"})`
    : "complete historical non-E2E estate";
console.log(
  `Running ${selection} in clean-room mode; ` +
    `${Object.keys(env).length} allowlisted runtime variables supplied.`,
);
if (canonicalReleaseSecondPass) {
  console.log(
    "The release second pass is explicit; a no-argument run still executes the complete historical non-E2E estate.",
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
