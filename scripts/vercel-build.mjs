import { spawnSync } from "node:child_process";
import { PROJECT_ID as CANONICAL_VERCEL_PROJECT_ID } from "./lib/vercel-project.mjs";

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...(options.env || {}) },
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
const isCanonicalVercelProject =
  String(process.env.VERCEL_PROJECT_ID || "").trim() === CANONICAL_VERCEL_PROJECT_ID;
const migrationsForced = process.env.WIRELINE_RUN_MIGRATIONS === "true";
const migrationsDisabled = process.env.WIRELINE_RUN_MIGRATIONS === "false";
const isCanonicalProduction = environment === "production" && isCanonicalVercelProject;

if (environment === "production" && !isCanonicalProduction) {
  console.error(
    "Refusing a production-target build on an unrecognized Vercel project. " +
      "Production data and provider credentials are pinned to the canonical Wireline project ID; " +
      "project-name heuristics are not an isolation boundary.",
  );
  process.exit(1);
}

if (isCanonicalProduction && migrationsDisabled) {
  console.error(
    "Refusing canonical production build with WIRELINE_RUN_MIGRATIONS=false. " +
      "Production must apply the exact-head append-only migration journal before serving traffic.",
  );
  process.exit(1);
}

const shouldMigrate = !migrationsDisabled && (migrationsForced || isCanonicalProduction);
const shouldVerifyProductionSchema = isCanonicalProduction;

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
  run("npx", ["tsx", "scripts/check-vapi-payload-contract-live.mts"]);
}

function runDeepLaunchAuditIfRequested() {
  const commitMessage = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "");
  if (!commitMessage.includes("[launch-deep-audit]")) return;

  console.log(
    `Running one-shot full TypeScript, ESLint, production-dependency security, and Vitest launch audit for ${environment || "local"}.`,
  );
  run("npm", ["run", "lint"]);
  run("npm", ["run", "lint:server"]);
  run("npm", ["run", "lint:audit-modules"]);
  run("npm", ["run", "lint:eslint"]);
  // Exact-head preview certification is the release authority while hosted
  // GitHub runners remain externally unavailable: TypeScript, zero-warning
  // ESLint, advisory gating, and the complete non-E2E suite all execute here.
  run("npm", ["run", "security:audit"]);
  // Vercel sets NODE_ENV=production and VERCEL=1 for its build process. Vitest
  // only supplies NODE_ENV=test when the variable is absent, so inheriting the
  // build flags makes unit tests take live-production secret/Redis paths. Keep
  // the audit exhaustive while giving the test subprocess its intended,
  // deterministic runtime identity; deployment-boundary checks above still run
  // under the real Preview/Production environment.
  run("npm", ["run", "test:run"], { env: { NODE_ENV: "test", VERCEL: "0" } });
}

function syncShowcaseIfRequested() {
  const commitMessage = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "");
  if (environment !== "production" || !commitMessage.includes("[sync-showcase]")) return;
  if (isDuplicateV0Project) {
    console.error("Refusing showcase synchronization from a duplicate Vercel project.");
    process.exit(1);
  }
  if (!process.env.VAPI_PRIVATE_KEY || !process.env.VAPI_WEBHOOK_SECRET) {
    console.error(
      "Refusing showcase synchronization without VAPI_PRIVATE_KEY and VAPI_WEBHOOK_SECRET.",
    );
    process.exit(1);
  }

  console.log("Synchronizing all public Wireline assistants after build certification.");
  run("npx", ["tsx", "scripts/sync-wireline-showcase.mts"]);
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

function validateProductionEnvironment() {
  if (!isCanonicalProduction) return;
  console.log("Validating required production environment variables before migration and build.");
  run("node", ["scripts/check-prod-env.mjs"]);
}

function verifyStripePortalIfRequested() {
  if (!isCanonicalProduction) return;
  if (process.env.WIRELINE_RECONCILE_STRIPE_PORTAL !== "true") {
    console.error(
      "Refusing canonical production build without WIRELINE_RECONCILE_STRIPE_PORTAL=true. " +
        "The managed customer portal must be verified on every production release.",
    );
    process.exit(1);
  }

  // Preserve the historical environment-variable name for deployed compatibility,
  // but keep artifact construction read-only with respect to Stripe. Drift must be
  // repaired explicitly through the operator command and then re-verified here.
  console.log("Verifying the canonical Stripe customer portal after build certification.");
  run("node", ["--import", "tsx", "scripts/reconcile-stripe-customer-portal.mts"]);
}

run("node", ["scripts/check-deployment-boundaries.mjs"]);
run("node", ["scripts/check-source-control-hygiene.mjs"]);
run("node", ["scripts/check-workflow-syntax.mjs"]);
run("node", ["scripts/check-docs-index.mjs"]);
run("node", ["scripts/check-wireline-clear-system.mjs"]);
run("node", ["scripts/check-native-release-horizon.mjs"]);
run("node", ["scripts/check-password-screening-disclosure.mjs"]);
run("node", ["scripts/check-provider-neutral-studio-entry.mjs"]);
run("node", ["scripts/check-marketing-measurement-consent.mjs"]);
run("node", ["scripts/check-mcp-http-hardening.mjs"]);
run("node", ["scripts/check-stripe-checkout-tax.mjs"]);
run("node", ["scripts/check-stripe-catalog-contract.mjs"]);
run("node", ["scripts/check-resend-webhook-readiness.mjs"]);
// Syntax-only by design: check-vendor-readiness probes live Stripe/Twilio/Vapi
// state and must not make network calls during a build. Run it for real via
// `npm run vendor:readiness` in the release checklist.
run("node", ["--check", "scripts/check-vendor-readiness.mjs"]);
run("npx", [
  "vitest",
  "run",
  "tests/runtime-provider-chain-contract.test.ts",
  "tests/structured-runtime-policy-contract.test.ts",
  "tests/model-pricing-coverage-contract.test.ts",
  "tests/vendor-readiness-contract.test.ts",
  "tests/runtime-integrations-registry-contract.test.ts",
  "tests/production-env-policy-contract.test.ts",
  "tests/production-build-env-gate-contract.test.ts",
  "tests/database-connection.test.ts",
  "tests/production-schema-database-selection.test.ts",
  "tests/migration-journal-integrity-contract.test.ts",
  "tests/production-schema-effects-contract.test.ts",
  "tests/production-promotion-safety-contract.test.ts",
  "tests/provider-spend-hard-gate-contract.test.ts",
  "tests/realtime-spend-reservation-contract.test.ts",
  "tests/stripe-portal-reconciler-contract.test.ts",
  "tests/stripe-founder-price-contract.test.ts",
  "tests/stripe-customer-binding-contract.test.ts",
  "tests/dogfood-credential-alias-contract.test.ts",
  "tests/product-voice-contract.test.ts",
  "tests/design-brand-polish-contract.test.ts",
  "tests/post-merge-ui-artifact-hardening-contract.test.ts",
  "tests/launch-completeness-contract.test.ts",
  "tests/double-pass-residual-hardening-contract.test.ts",
  "tests/phone-settings-attach-contract.test.ts",
  "tests/phone-self-serve-setup-contract.test.ts",
  "tests/auth-journey-hardening-contract.test.ts",
  "tests/auth-token-atomicity-contract.test.ts",
  "tests/auth-oauth-browser-binding-contract.test.ts",
  "tests/oauth-active-session-binding-contract.test.ts",
  "tests/internal-jwt-claim-validation.test.ts",
  "tests/oauth-rate-limit-middleware.test.ts",
  "tests/oauth-provider-identity-integrity-contract.test.ts",
  "tests/yahoo-openid-security.test.ts",
  "tests/yahoo-jwks-rotation.test.ts",
  "tests/spend-guard-integrity-contract.test.ts",
  "tests/free-builder-spend-ui-contract.test.ts",
  "tests/resend-webhook-feedback-contract.test.ts",
  "tests/launch-truth-contract.test.ts",
  "tests/double-pass-launch-honesty-contract.test.ts",
  "tests/launch-artifact-privacy-and-ops-truth-contract.test.ts",
  "tests/ai-cost-protection-contract.test.ts",
  "tests/public-health-probe.test.ts",
  "tests/public-health-function.test.ts",
  "tests/public-health-distributed-cache-contract.test.ts",
  "tests/health-surfaces-contract.test.ts",
  "tests/integration/api-health.test.ts",
  "tests/billing-proof-contract.test.ts",
  "tests/live-video-stripe-races.test.ts",
  "tests/twilio-accepted-reconciliation-behavior.test.ts",
  "tests/lifecycle-notification-durability-contract.test.ts",
  "tests/post-call-notification-durability.test.ts",
  "tests/post-call-csat-behavior.test.ts",
  "tests/post-call-csat-preprovider-refund.test.ts",
  "tests/account-deletion-post-call-fence.test.ts",
  "tests/auth-terminal-deletion-gate.test.ts",
  "tests/signin-failure-durability.test.ts",
  "tests/tenant-pool-transaction.test.ts",
  "tests/sms-inbox-error-honesty-contract.test.ts",
  "tests/prelaunch-account-export-and-twilio.test.ts",
  "tests/operational-slo-accuracy.test.ts",
  "tests/website-knowledge-spend.test.ts",
  "tests/stripe-checkout-branding-contract.test.ts",
  "src/lib/plan-catalog.test.ts",
  "tests/round6-margin-capacity-contract.test.ts",
  "src/lib/video-presenter/live-video-policy.test.ts",
  "tests/live-video-economics-contract.test.ts",
  "tests/live-video-base-plan-cascade-contract.test.ts",
  "tests/video-presenter-contract.test.ts",
  "tests/signup-bootstrap-integrity-contract.test.ts",
  "tests/repo-documentation-organization-contract.test.ts",
  "tests/marketing-metadata-contract.test.ts",
  "tests/static-metadata-contract.test.ts",
  "tests/wireline-product-docs.test.ts",
  "tests/mailbox-and-daily-brief-hardening-contract.test.ts",
  "tests/managed-vapi-runtime-contract.test.ts",
  "tests/vapi-modern-payload-contract.test.ts",
  "src/lib/vapi-report-normalization.test.ts",
  "tests/twilio-webhook-privacy.test.ts",
  "tests/email-observability-privacy-contract.test.ts",
  "tests/platform-ledger-integrity-contract.test.ts",
  "tests/carrier-release-integrity.test.ts",
  "tests/capacity-and-carrier-double-pass.test.ts",
  "tests/extra-agent-payment-atomicity.test.ts",
  "tests/durable-enqueue-contract.test.ts",
  "tests/billing-release-gate-contract.test.ts",
  "tests/job-queue-priority-contract.test.ts",
  "tests/showcase-truth-sync-contract.test.ts",
  // These are direct financial, tenant, external-delivery, secure-ingestion,
  // and durable-work boundaries. They must run on every preview and
  // production-equivalent build, not only in the one-shot full suite.
  "tests/checkout-customer-recovery-contract.test.ts",
  "tests/shared-workspace-readiness-contract.test.ts",
  "tests/webhook-delivery-literal-ssrf-contract.test.ts",
  "tests/webhook-dns-pinning-contract.test.ts",
  "tests/webhook-management-hardening-contract.test.ts",
  "tests/webhook-signing-contract.test.ts",
  "tests/webhook-delivery-truth-contract.test.ts",
  "tests/webhook-response-stream-safety.test.ts",
  "tests/website-knowledge-ingestion-contract.test.ts",
  "tests/website-knowledge-timeout.test.ts",
  "tests/website-fetch-stream-safety.test.ts",
  "tests/job-attempt-fencing-contract.test.ts",
]);
runLiveVapiSchemaAuditIfRequested();
configurePreviewEnvironment();
validateProductionEnvironment();
runDeepLaunchAuditIfRequested();
run("node", ["scripts/check-operational-core.mjs"]);
run("node", ["scripts/build-design-tokens.mjs"]);

if (shouldMigrate) {
  if (!databaseUrl) {
    console.error(
      "Refusing to run production migrations without POSTGRES_URL or DATABASE_URL. " +
        "Only non-live duplicate Vercel projects may disable migration execution.",
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

// This is a read-only release assertion and must run for every real production
// build even when migration execution is explicitly disabled. A migration
// override cannot weaken the runtime schema contract. The wrapper first selects
// the same validated database URL as the application runtime.
if (shouldVerifyProductionSchema) {
  run("node", ["scripts/run-production-schema-effects.mjs"]);
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
syncShowcaseIfRequested();
verifyStripePortalIfRequested();
