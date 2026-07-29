import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;
const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const projectHint = [
  process.env.VERCEL_PROJECT_ID,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
]
  .filter(Boolean)
  .join(" ");
const isDuplicateV0Project = /(^|[\s.-])v0-project([\s.-]|$)/i.test(projectHint);
const migrationsForced = process.env.WIRELINE_RUN_MIGRATIONS === "true";
const migrationsDisabled = process.env.WIRELINE_RUN_MIGRATIONS === "false";
const shouldMigrate =
  !migrationsDisabled &&
  (migrationsForced || (environment === "production" && !isDuplicateV0Project));

function runLiveVapiSchemaAuditIfRequested() {
  const commitMessage = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "");
  if (environment !== "preview" || !commitMessage.includes("[launch-deep-audit]")) return;

  if (!process.env.VAPI_PRIVATE_KEY || !process.env.VAPI_WEBHOOK_SECRET) {
    console.log(
      "Skipping the optional live Vapi schema audit because preview-safe credentials are not configured.",
    );
    return;
  }

  console.log("Running one-shot non-billable Vapi payload schema audit.");
  run("node", ["scripts/check-vapi-payload-contract-live.mjs"]);
}

function runDeepLaunchAuditIfRequested() {
  const commitMessage = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "");
  if (!commitMessage.includes("[launch-deep-audit]")) return;

  console.log(
    `Running one-shot full TypeScript, ESLint, and Vitest launch audit for ${environment || "local"}.`,
  );
  run("npm", ["run", "lint"]);
  run("npm", ["run", "lint:server"]);
  run("npm", ["run", "lint:audit-modules"]);
  run("npm", ["run", "lint:eslint"]);
  run("npm", ["run", "test:run"]);
}

function configurePreviewEnvironment() {
  if (environment !== "preview") return;

  const previewHost = String(process.env.VERCEL_URL || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (previewHost) {
    process.env.APP_URL = `https://${previewHost}`;
    console.log(
      `Preview build: APP_URL resolved to https://${previewHost}; runtime origin remains request-derived.`,
    );
  }
}

run("node", ["scripts/check-deployment-boundaries.mjs"]);
run("node", ["scripts/check-source-control-hygiene.mjs"]);
run("node", ["scripts/check-docs-index.mjs"]);
run("node", ["scripts/check-wireline-clear-system.mjs"]);
run("node", ["scripts/check-native-release-horizon.mjs"]);
run("node", ["scripts/check-password-screening-disclosure.mjs"]);
run("node", ["scripts/check-provider-neutral-studio-entry.mjs"]);
run("node", ["scripts/check-marketing-measurement-consent.mjs"]);
run("node", ["scripts/check-mcp-http-hardening.mjs"]);
run("node", ["scripts/check-stripe-checkout-tax.mjs"]);
run("node", ["scripts/check-stripe-catalog-contract.mjs"]);
run("node", ["--check", "scripts/check-vendor-readiness.mjs"]);
run("npx", [
  "vitest",
  "run",
  "tests/runtime-provider-chain-contract.test.ts",
  "tests/structured-runtime-policy-contract.test.ts",
  "tests/vendor-readiness-contract.test.ts",
  "tests/runtime-integrations-registry-contract.test.ts",
  "tests/production-env-policy-contract.test.ts",
  "tests/database-connection.test.ts",
  "tests/product-voice-contract.test.ts",
  "tests/design-brand-polish-contract.test.ts",
  "tests/post-merge-ui-artifact-hardening-contract.test.ts",
  "tests/auth-journey-hardening-contract.test.ts",
  // Recovery-token atomicity and expiry cleanup are account-security boundaries.
  "tests/auth-token-atomicity-contract.test.ts",
  // Provider-host binding, browser-bound bridge state, verified identity, key
  // rotation, and one-check throttling protect account-session integrity.
  "tests/auth-oauth-browser-binding-contract.test.ts",
  "tests/oauth-rate-limit-middleware.test.ts",
  "tests/oauth-provider-identity-integrity-contract.test.ts",
  "tests/yahoo-openid-security.test.ts",
  "tests/yahoo-jwks-rotation.test.ts",
  // Missing or malformed spend controls and partial signup bootstrap are
  // provider-cost and entitlement-integrity failures.
  "tests/spend-guard-integrity-contract.test.ts",
  // Public launch claims, customer-controlled spend provenance, and reversible
  // subscription deletion are release boundaries, not optional regression tests.
  "tests/launch-truth-contract.test.ts",
  // Launch status and billing-status pool headroom must stay fail-closed.
  "tests/double-pass-launch-honesty-contract.test.ts",
  "tests/ai-cost-protection-contract.test.ts",
  "tests/billing-proof-contract.test.ts",
  // Pricing capacity must reserve Payments, Billing, and future Tax fees on
  // both intervals; do not let catalog metadata drift from entitlements.
  "src/lib/plan-catalog.test.ts",
  "tests/round6-margin-capacity-contract.test.ts",
  // Live Video must remain launch-paused and economically bounded until its
  // curated catalog and paid lifecycle are proven.
  "src/lib/video-presenter/live-video-policy.test.ts",
  "tests/live-video-economics-contract.test.ts",
  "tests/signup-bootstrap-integrity-contract.test.ts",
  "tests/repo-documentation-organization-contract.test.ts",
  "tests/marketing-metadata-contract.test.ts",
  "tests/static-metadata-contract.test.ts",
  "tests/wireline-product-docs.test.ts",
  "tests/mailbox-and-daily-brief-hardening-contract.test.ts",
  "tests/managed-vapi-runtime-contract.test.ts",
  "tests/vapi-modern-payload-contract.test.ts",
  // End-of-call cost, duration, transcript, and recording evidence must remain
  // compatible with both current report and call-object payload shapes.
  "src/lib/vapi-report-normalization.test.ts",
  "tests/twilio-webhook-privacy.test.ts",
  // Recipient addresses, bearer links, and provider error bodies must stay out of logs.
  "tests/email-observability-privacy-contract.test.ts",
  // GDPR carrier cleanup and compliance ledgers are cost and deletion-integrity
  // boundaries; keep their migration/runtime contracts in every build.
  "tests/platform-ledger-integrity-contract.test.ts",
  "tests/carrier-release-integrity.test.ts",
  // Paid/free capacity and purchased-capacity mutations must agree across web,
  // mobile, MCP, Stripe settlement, and legacy entitlement mirrors.
  "tests/capacity-and-carrier-double-pass.test.ts",
  // Purchased capacity must settle atomically with its immediate Stripe invoice.
  "tests/extra-agent-payment-atomicity.test.ts",
  // Durable persistence failures are financial/runtime integrity failures, so
  // this contract belongs in every preview and production-equivalent build.
  "tests/durable-enqueue-contract.test.ts",
]);
runLiveVapiSchemaAuditIfRequested();
configurePreviewEnvironment();
runDeepLaunchAuditIfRequested();
run("node", ["scripts/check-operational-core.mjs"]);
run("node", ["scripts/build-design-tokens.mjs"]);

if (shouldMigrate) {
  if (!databaseUrl) {
    console.error(
      "Refusing to run production migrations without POSTGRES_URL or DATABASE_URL. " +
        "Set WIRELINE_RUN_MIGRATIONS=false only on non-live duplicate Vercel projects.",
    );
    process.exit(1);
  }

  run("npm", ["run", "db:migrate"]);
} else {
  console.log(
    `Skipping database migrations for ${environment || "local"} build${
      isDuplicateV0Project ? " on duplicate v0-project" : ""
    }.`,
  );
}

run("npm", ["run", "build"]);
run("npm", ["run", "smoke:server"]);
run("npx", [
  "esbuild",
  "src/entrypoints/chatgpt-mcp-api.ts",
  "--platform=node",
  "--bundle",
  "--format=cjs",
  "--outfile=dist/chatgpt-mcp-api.cjs",
]);
