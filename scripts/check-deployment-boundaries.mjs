#!/usr/bin/env node

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const isProduction = environment === "production";
const isPreview = environment === "preview";
const failures = [];

const value = (name) => String(process.env[name] || "").trim();
const requireValue = (name, reason) => {
  if (!value(name)) failures.push(`${name}: ${reason}`);
};

function validHttpsUrl(name, required = false) {
  const raw = value(name);
  if (!raw) {
    if (required) failures.push(`${name}: required for ${environment} deployments`);
    return;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") failures.push(`${name}: must use https`);
  } catch {
    failures.push(`${name}: must be a valid absolute URL`);
  }
}

if (isProduction) {
  requireValue("POSTGRES_URL", "production API database connection is missing");
  requireValue("DATABASE_POOL_URL", "the serverless transaction pool is missing");
  requireValue("INTERNAL_JWT_SECRET", "production session signing is missing");
  requireValue("WIRELINE_DATA_KEY", "encrypted tenant credentials cannot be stored safely");
  requireValue("OAUTH_STATE_SECRET", "OAuth state signing is missing");
  requireValue("OAUTH_BRIDGE_SECRET", "MCP authorization bridging is missing");
  requireValue("MCP_OAUTH_TOKEN_PEPPER", "MCP OAuth tokens cannot be hashed safely");
  requireValue("OPENAI_API_KEY", "the primary managed structured runtime and OpenAI Realtime sessions are missing");
  // XAI_API_KEY is optional experiment-only; never a production launch requirement.
  requireValue("VAPI_PRIVATE_KEY", "the managed live-call runtime is missing");
  requireValue("VAPI_WEBHOOK_SECRET", "Vapi callbacks cannot be verified");
  requireValue("VITE_VAPI_PUBLIC_KEY", "the public live-call client cannot initialize");
  requireValue("TWILIO_ACCOUNT_SID", "Twilio account binding is missing");
  requireValue("TWILIO_API_KEY", "scoped Twilio REST authentication is missing");
  requireValue("TWILIO_API_SECRET", "scoped Twilio REST authentication is incomplete");
  requireValue("TWILIO_AUTH_TOKEN", "Twilio callbacks cannot be verified");
  requireValue("PLATFORM_SMS_FROM", "platform SMS escalation routing is missing");
  requireValue("STRIPE_SECRET_KEY", "production billing is missing");
  requireValue("STRIPE_WEBHOOK_SECRET", "Stripe callbacks cannot be verified");
  requireValue("VITE_STRIPE_PUBLIC_KEY", "production checkout cannot initialize");
  requireValue("RESEND_API_KEY", "transactional email delivery is missing");
  requireValue("UPSTASH_REDIS_REST_URL", "distributed rate limiting is missing");
  requireValue("UPSTASH_REDIS_REST_TOKEN", "distributed rate limiting cannot authenticate");
  requireValue("CRON_SECRET", "scheduled jobs cannot authenticate");
  validHttpsUrl("APP_URL", true);
  validHttpsUrl("TWILIO_WEBHOOK_BASE_URL", false);

  if (value("STRIPE_SECRET_KEY") && !value("STRIPE_SECRET_KEY").startsWith("sk_live_")) {
    failures.push("STRIPE_SECRET_KEY: production must use a live-mode key");
  }
  if (
    value("VITE_STRIPE_PUBLIC_KEY") &&
    !value("VITE_STRIPE_PUBLIC_KEY").startsWith("pk_live_")
  ) {
    failures.push("VITE_STRIPE_PUBLIC_KEY: production must use a live-mode key");
  }
}

const productionOnlyPreviewKeys = [
  "APOLLO_CLIENT_ID",
  "APP_URL",
  "CORS_ORIGINS",
  "FEDERAL_DNC_API_KEY",
  "FEDERAL_DNC_API_URL",
  "GOOGLE_CLIENT_ID",
  "HUBSPOT_CLIENT_ID",
  "DATABASE_POOL_URL",
  "MCP_OAUTH_ALLOWED_CLIENT_IDS",
  "MCP_OAUTH_ALLOWED_REDIRECT_URIS",
  "META_APP_ID",
  "MICROSOFT_CLIENT_ID",
  "OWNER_EMAIL",
  "OWNER_PHONE",
  "POSTGRES_URL",
  "PLATFORM_SMS_FROM",
  "SALESFORCE_CLIENT_ID",
  "SHOPIFY_CLIENT_ID",
  "SLACK_CLIENT_ID",
  "SQUARE_APPLICATION_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_WEBHOOK_BASE_URL",
  "UPSTASH_REDIS_REST_URL",
  "VITE_STRIPE_PUBLIC_KEY",
  "VITE_VAPI_PUBLIC_KEY",
  "WIRELINE_LAUNCH_DEMO_MODE",
  "X_CLIENT_ID",
  "YAHOO_CLIENT_ID",
  "ZOOM_CLIENT_ID",
];

const credentialLikeName =
  /(?:^|_)(?:API_KEY|API_SECRET|AUTH_KEY|AUTH_TOKEN|ACCESS_TOKEN|CLIENT_SECRET|PRIVATE_KEY|SERVICE_ROLE_KEY|PASSWORD|WEBHOOK_SECRET|JWT_SECRET|DATA_KEY|TOKEN_PEPPER|CRON_SECRET|MONITOR_TOKEN|SECRET|TOKEN)(?:_|$)/;
const platformManagedCredential = /^(?:VERCEL|TURBO|NPM|NODE|GITHUB|CI)_/;

if (isPreview) {
  const productionOnlyPreviewKeySet = new Set(productionOnlyPreviewKeys);

  for (const name of productionOnlyPreviewKeys) {
    if (value(name)) {
      failures.push(
        `${name}: production-only configuration must not be available to preview builds or runtime`,
      );
    }
  }

  for (const name of Object.keys(process.env)) {
    if (
      !productionOnlyPreviewKeySet.has(name) &&
      !platformManagedCredential.test(name) &&
      credentialLikeName.test(name) &&
      value(name)
    ) {
      failures.push(
        `${name}: credential-like project configuration requires an explicit, reviewed preview sandbox policy`,
      );
    }

    if (/^STRIPE_.*(?:PRICE_ID|METER_EVENT_NAME)$/.test(name) && value(name)) {
      failures.push(
        `${name}: the production Stripe catalog must not be available to preview builds or runtime`,
      );
    }
  }

  if (
    value("WIRELINE_RUN_MIGRATIONS") === "true" &&
    value("WIRELINE_PREVIEW_DATABASE_ISOLATED") !== "true"
  ) {
    failures.push(
      "WIRELINE_RUN_MIGRATIONS: preview migrations require WIRELINE_PREVIEW_DATABASE_ISOLATED=true and a non-production database.",
    );
  }
}

if (failures.length) {
  console.error(`Deployment-boundary check failed for ${environment}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Deployment-boundary check passed for ${environment}.`);
