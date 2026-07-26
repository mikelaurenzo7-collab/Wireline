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
  requireValue("INTERNAL_JWT_SECRET", "production session signing is missing");
  requireValue("OAUTH_STATE_SECRET", "OAuth state signing is missing");
  requireValue("OPENAI_API_KEY", "the primary managed structured runtime and OpenAI Realtime sessions are missing");
  // XAI_API_KEY is optional experiment-only; never a production launch requirement.
  requireValue("VAPI_PRIVATE_KEY", "the managed live-call runtime is missing");
  requireValue("VAPI_WEBHOOK_SECRET", "Vapi callbacks cannot be verified");
  requireValue("TWILIO_ACCOUNT_SID", "Twilio account binding is missing");
  requireValue("TWILIO_AUTH_TOKEN", "Twilio callbacks cannot be verified");
  requireValue("STRIPE_SECRET_KEY", "production billing is missing");
  requireValue("STRIPE_WEBHOOK_SECRET", "Stripe callbacks cannot be verified");
  requireValue("VITE_STRIPE_PUBLIC_KEY", "production checkout cannot initialize");
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
  "AI_GATEWAY_API_KEY",
  "APOLLO_API_KEY",
  "APOLLO_CLIENT_ID",
  "APOLLO_CLIENT_SECRET",
  "APP_URL",
  "CORS_ORIGINS",
  "CRON_SECRET",
  "DATABASE_POOL_URL",
  "DOGFOOD_PASSWORD",
  "E2E_USER_PASSWORD",
  "FEDERAL_DNC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "HEALTH_MONITOR_TOKEN",
  "HUBSPOT_CLIENT_ID",
  "HUBSPOT_CLIENT_SECRET",
  "INTERNAL_JWT_SECRET",
  "LIVEAVATAR_API_KEY",
  "MCP_OAUTH_ALLOWED_CLIENT_IDS",
  "MCP_OAUTH_ALLOWED_REDIRECT_URIS",
  "MCP_OAUTH_TOKEN_PEPPER",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_VERIFY_TOKEN",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "OAUTH_BRIDGE_SECRET",
  "OAUTH_STATE_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_CHATKIT",
  "OWNER_EMAIL",
  "OWNER_PHONE",
  "PLATFORM_SMS_FROM",
  "POSTGRES_URL",
  "RESEND_API_KEY",
  "SALESFORCE_CLIENT_ID",
  "SALESFORCE_CLIENT_SECRET",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_STOREFRONT_ACCESS_TOKEN",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SQUARE_APPLICATION_ID",
  "SQUARE_APPLICATION_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_AUTH_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "VAPI_PRIVATE_KEY",
  "VAPI_WEBHOOK_SECRET",
  "VITE_STRIPE_PUBLIC_KEY",
  "VITE_VAPI_PUBLIC_KEY",
  "WIRELINE_DATA_KEY",
  "WIRELINE_E2E_PASSWORD",
  "XAI_API_KEY",
  "XAI_API_KEY_CHATKIT",
  "X_API_KEY",
  "X_API_SECRET",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "YAHOO_CLIENT_ID",
  "YAHOO_CLIENT_SECRET",
  "ZOOM_CLIENT_ID",
  "ZOOM_CLIENT_SECRET",
];

if (isPreview) {
  for (const name of productionOnlyPreviewKeys) {
    if (value(name)) {
      failures.push(
        `${name}: production-only configuration must not be available to preview builds or runtime`,
      );
    }
  }

  for (const name of Object.keys(process.env)) {
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
