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

function runStripeBalanceAuditIfRequested() {
  const commitMessage = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "");
  if (environment !== "preview" || !commitMessage.includes("[stripe-balance-audit]")) return;

  console.log(
    "Running one-shot read-only Stripe balance audit; no Stripe objects will be created or mutated.",
  );
  const result = spawnSync("node", ["scripts/check-stripe-balance-cause.mjs"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  console.log(
    `One-shot Stripe balance audit completed with status ${result.status ?? 1}; preview build will continue for evidence collection.`,
  );
}

function sanitizePreviewEnvironment() {
  if (
    environment !== "preview" ||
    process.env.WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW === "true"
  ) {
    return;
  }

  const liveStripeInherited = String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");
  const livePublishableInherited = String(process.env.VITE_STRIPE_PUBLIC_KEY || "").startsWith(
    "pk_live_",
  );

  if (liveStripeInherited || livePublishableInherited || process.env.STRIPE_WEBHOOK_SECRET) {
    for (const key of Object.keys(process.env)) {
      if (
        key === "STRIPE_SECRET_KEY" ||
        key === "STRIPE_WEBHOOK_SECRET" ||
        key === "VITE_STRIPE_PUBLIC_KEY" ||
        /^STRIPE_.*_PRICE_ID$/.test(key) ||
        key === "STRIPE_VOICE_OVERAGE_METER_EVENT_NAME"
      ) {
        delete process.env[key];
      }
    }
    process.env.WIRELINE_STRIPE_DISABLED_IN_PREVIEW = "true";
    console.warn("Preview isolation: Stripe credentials and catalog identifiers were removed.");
  }

  const previewHost = String(process.env.VERCEL_URL || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (previewHost) {
    process.env.APP_URL = `https://${previewHost}`;
    console.log(`Preview isolation: APP_URL resolved to https://${previewHost}.`);
  }
}

run("node", ["scripts/check-deployment-boundaries.mjs"]);
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
]);
runStripeBalanceAuditIfRequested();
sanitizePreviewEnvironment();
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
run("npx", [
  "esbuild",
  "src/entrypoints/chatgpt-mcp-api.ts",
  "--platform=node",
  "--bundle",
  "--format=cjs",
  "--outfile=dist/chatgpt-mcp-api.cjs",
]);
