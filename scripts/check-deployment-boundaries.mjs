#!/usr/bin/env node

import {
  assertIsolatedPreviewDatabaseUrl,
  resolvePreviewMigrationDatabaseUrl,
} from "./lib/preview-migration-database.mjs";

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const isProduction = environment === "production";
const isPreview = environment === "preview";
const failures = [];
const notices = [];
const CANONICAL_PRODUCTION_ORIGIN = "https://botbound.app";
const CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF = "ogenlhodmwvyacvnrsnj";

const value = (name) => String(process.env[name] || "").trim();
const affirmative = (name) => ["1", "true", "yes", "on"].includes(value(name).toLowerCase());
const requireValue = (name, reason) => {
  if (!value(name)) failures.push(`${name}: ${reason}`);
};

function canonicalProductionUrl(name, required = false) {
  const raw = value(name);
  if (!raw) {
    if (required) failures.push(`${name}: required for ${environment} deployments`);
    return;
  }
  try {
    const url = new URL(raw);
    if (url.origin !== CANONICAL_PRODUCTION_ORIGIN || raw !== CANONICAL_PRODUCTION_ORIGIN) {
      failures.push(`${name}: must be exactly ${CANONICAL_PRODUCTION_ORIGIN}`);
    }
  } catch {
    failures.push(`${name}: must be a valid absolute URL`);
  }
}

function canonicalProductionDatabase(name) {
  const raw = value(name);
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      failures.push(`${name}: production database must use PostgreSQL`);
      return;
    }

    const hostname = url.hostname.toLowerCase();
    const directEndpoint = /^db\.([a-z0-9]{20})\.supabase\.co$/u.exec(hostname);
    const poolerEndpoint = /^(?:[a-z0-9-]+\.)*pooler\.supabase\.com$/u.test(hostname);
    let resolvedProjectRef = "";

    if (directEndpoint) {
      // Direct Supabase endpoints bind project identity in the hostname. Never
      // let a username label override or mask a different direct host.
      resolvedProjectRef = directEndpoint[1];
    } else if (poolerEndpoint) {
      // Supavisor pooler hosts are shared across projects. Their project
      // identity is the exact final username label: postgres.<project-ref>.
      const decodedUsername = decodeURIComponent(url.username).toLowerCase();
      const poolerUsername = /^[^.]+\.([a-z0-9]{20})$/u.exec(decodedUsername);
      if (!poolerUsername) {
        failures.push(
          `${name}: Supabase pooler username must end with an exact 20-character project ref`,
        );
        return;
      }
      resolvedProjectRef = poolerUsername[1];
    } else {
      failures.push(
        `${name}: production database must use db.<ref>.supabase.co or a Supabase pooler endpoint`,
      );
      return;
    }

    const port = Number(url.port || "5432");
    if (name === "POSTGRES_URL" && port !== 5432) {
      failures.push(
        "POSTGRES_URL: production migrations and session-bound tools require port 5432",
      );
    }
    if (name === "DATABASE_POOL_URL" && (!poolerEndpoint || port !== 6543)) {
      failures.push(
        "DATABASE_POOL_URL: production serverless runtime requires the shared Supabase transaction pooler on port 6543",
      );
    }

    if (resolvedProjectRef !== CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF) {
      failures.push(
        `${name}: production database must identify canonical Supabase project ${CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF}`,
      );
    }
  } catch {
    failures.push(`${name}: production database must be a valid PostgreSQL URL`);
  }
}

function requireProductionCorsOrigins() {
  const configured = new Set(
    value("CORS_ORIGINS")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  // Legacy browser origins are optional and require operator ownership/routing
  // verification. Signed provider callback compatibility does not require CORS.
  if (!configured.has(CANONICAL_PRODUCTION_ORIGIN)) {
    failures.push(`CORS_ORIGINS: must include ${CANONICAL_PRODUCTION_ORIGIN}`);
  }
}

if (isProduction) {
  requireValue("POSTGRES_URL", "production API database connection is missing");
  requireValue("DATABASE_POOL_URL", "the serverless transaction pool is missing");
  requireValue("CORS_ORIGINS", "production browser-origin allowlist is missing");
  requireValue("INTERNAL_JWT_SECRET", "production session signing is missing");
  requireValue("WIRELINE_DATA_KEY", "encrypted tenant credentials cannot be stored safely");
  requireValue("OAUTH_STATE_SECRET", "OAuth state signing is missing");
  requireValue("OAUTH_BRIDGE_SECRET", "MCP authorization bridging is missing");
  requireValue("MCP_OAUTH_TOKEN_PEPPER", "MCP OAuth tokens cannot be hashed safely");
  requireValue(
    "OPENAI_API_KEY",
    "the managed primary structured runtime and OpenAI Realtime sessions are missing",
  );
  requireValue("OPENAI_PROJECT_ID", "the OpenAI Realtime SIP project binding is missing");
  requireValue("OPENAI_WEBHOOK_SECRET", "OpenAI Realtime incoming-call events cannot be verified");
  requireValue("TWILIO_ACCOUNT_SID", "Twilio account binding is missing");
  requireValue("TWILIO_API_KEY", "scoped Twilio REST authentication is missing");
  requireValue("TWILIO_API_SECRET", "scoped Twilio REST authentication is incomplete");
  requireValue("TWILIO_AUTH_TOKEN", "Twilio callbacks cannot be verified");
  requireValue("AGENTMAIL_API_KEY", "paid Bot managed-email provisioning is missing");
  requireValue("AGENTMAIL_DEFAULT_DOMAIN", "BotBound managed-email domain is missing");
  requireValue("STRIPE_SECRET_KEY", "production billing is missing");
  requireValue("STRIPE_WEBHOOK_SECRET", "Stripe callbacks cannot be verified");
  requireValue("VITE_STRIPE_PUBLIC_KEY", "production checkout cannot initialize");
  requireValue("RESEND_API_KEY", "transactional email delivery is missing");
  requireValue("UPSTASH_REDIS_REST_URL", "distributed rate limiting is missing");
  requireValue("UPSTASH_REDIS_REST_TOKEN", "distributed rate limiting cannot authenticate");
  requireValue("CRON_SECRET", "scheduled jobs cannot authenticate");
  canonicalProductionUrl("APP_URL", true);
  canonicalProductionUrl("TWILIO_WEBHOOK_BASE_URL", true);
  canonicalProductionDatabase("POSTGRES_URL");
  canonicalProductionDatabase("DATABASE_POOL_URL");
  if (value("NODE_TLS_REJECT_UNAUTHORIZED") === "0") {
    failures.push("NODE_TLS_REJECT_UNAUTHORIZED: production may not disable TLS verification");
  }
  if (["disable", "no-verify"].includes(value("PGSSLMODE").toLowerCase())) {
    failures.push("PGSSLMODE: production may not weaken PostgreSQL TLS verification");
  }
  requireProductionCorsOrigins();
  const managedEmailDomain = value("AGENTMAIL_DEFAULT_DOMAIN").toLowerCase().replace(/^@/, "");
  if (
    managedEmailDomain &&
    managedEmailDomain !== "botbound.app" &&
    !managedEmailDomain.endsWith(".botbound.app")
  ) {
    failures.push(
      "AGENTMAIL_DEFAULT_DOMAIN: production managed mailboxes must use botbound.app or a BotBound subdomain",
    );
  }
  if (value("WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD")) {
    const realtimeReserveUsd = Number(value("WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD"));
    if (!Number.isFinite(realtimeReserveUsd) || realtimeReserveUsd < 1) {
      failures.push(
        "WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD: production must be a finite USD amount of at least 1.00 per five-minute gpt-realtime-2.1 session",
      );
    }
  }
  if (
    value("WIRELINE_STRUCTURED_PRIMARY_PROVIDER") &&
    value("WIRELINE_STRUCTURED_PRIMARY_PROVIDER").toLowerCase() !== "openai"
  ) {
    failures.push(
      "WIRELINE_STRUCTURED_PRIMARY_PROVIDER: production must be unset or openai; other providers are continuity lanes only",
    );
  }

  if (value("VITE_VAPI_PUBLIC_KEY")) {
    failures.push(
      "VITE_VAPI_PUBLIC_KEY: retired browser credential must be removed before production; public previews use one-use BotBound tickets and server-mediated OpenAI WebRTC",
    );
  }

  if (value("STRIPE_SECRET_KEY") && !/^(?:sk|rk)_live_/.test(value("STRIPE_SECRET_KEY"))) {
    failures.push("STRIPE_SECRET_KEY: production must use a live-mode key");
  }
  if (value("VITE_STRIPE_PUBLIC_KEY") && !value("VITE_STRIPE_PUBLIC_KEY").startsWith("pk_live_")) {
    failures.push("VITE_STRIPE_PUBLIC_KEY: production must use a live-mode key");
  }
  if (
    affirmative("WIRELINE_SELF_SERVE_BILLING_ENABLED") &&
    value("WIRELINE_LAUNCH_DEMO_MODE").toLowerCase() !== "false"
  ) {
    failures.push(
      "WIRELINE_SELF_SERVE_BILLING_ENABLED: production checkout requires WIRELINE_LAUNCH_DEMO_MODE=false so paid activity is not classified as demo evidence",
    );
  }

  if (affirmative("WIRELINE_SELF_SERVE_BILLING_ENABLED")) {
    const gitRef = value("VERCEL_GIT_COMMIT_REF").toLowerCase();
    if (gitRef !== "main") {
      failures.push(
        "WIRELINE_SELF_SERVE_BILLING_ENABLED: self-serve billing may only ship from the audited main production release channel",
      );
    } else {
      notices.push(
        "Self-serve billing is authorized for the audited main production release channel; per-commit release-SHA rotation is retired.",
      );
    }
    if (value("WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA")) {
      notices.push(
        "WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA is legacy configuration and no longer controls runtime billing authorization.",
      );
    }
  }
}

const productionOnlyPreviewKeys = [
  "AGENTMAIL_DEFAULT_DOMAIN",
  "APOLLO_CLIENT_ID",
  "APP_URL",
  "CORS_ORIGINS",
  "FEDERAL_DNC_API_KEY",
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
  "WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA",
  "WIRELINE_RECONCILE_STRIPE_PORTAL",
  "X_CLIENT_ID",
  "YAHOO_CLIENT_ID",
  "ZOOM_CLIENT_ID",
];

const credentialLikeName =
  /(?:^|_)(?:API_KEY|API_SECRET|AUTH_KEY|AUTH_TOKEN|ACCESS_TOKEN|CLIENT_SECRET|PRIVATE_KEY|SERVICE_ROLE_KEY|PASSWORD|WEBHOOK_SECRET|JWT_SECRET|DATA_KEY|TOKEN_PEPPER|CRON_SECRET|MONITOR_TOKEN|SECRET|TOKEN)(?:_|$)/;
const platformManagedCredential = /^(?:VERCEL|TURBO|NPM|NODE|GITHUB|CI)_/;

/**
 * Narrow, reviewed preview credential policies. This is not a generic
 * provider-key bypass.
 *
 * Perplexity:
 * - PERPLEXITY_API_KEY may be inherited from Vercel project configuration, but
 *   src/lib/perplexity-platform.ts deliberately ignores it when VERCEL_ENV=preview.
 * - PERPLEXITY_PREVIEW_API_KEY is the only Perplexity credential preview runtime
 *   may use; when configured it must be a dedicated budget-capped preview key.
 *
 * Retired voice-provider credentials are never accepted by a Preview build.
 */
const reviewedPreviewCredentialKeys = new Set(["PERPLEXITY_API_KEY", "PERPLEXITY_PREVIEW_API_KEY"]);
const previewSpendAuthorityKeys = [
  "AGENTMAIL_API_KEY",
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "APOLLO_API_KEY",
  "BOTBOUND_ELEVENLABS_VOICE_API_KEY",
  "CLOUD_COMPUTER_BROWSER_WS_URL",
  "FEDERAL_DNC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_CHATKIT",
  "PERPLEXITY_PREVIEW_API_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_AUTH_TOKEN",
  "VAPI_PRIVATE_KEY",
  "VOICE_ENGINE_SERVICE_TOKEN",
  "XAI_API_KEY",
  "XAI_API_KEY_CHATKIT",
  "XAI_MANAGEMENT_API_KEY",
];
const reviewedIsolatedPreviewDatabaseKeys = new Set([
  "INTERNAL_JWT_SECRET",
  "OWNER_EMAIL",
  "POSTGRES_URL",
]);

if (isPreview) {
  const productionOnlyPreviewKeySet = new Set(productionOnlyPreviewKeys);
  const isolatedPreviewDatabase = affirmative("WIRELINE_PREVIEW_DATABASE_ISOLATED");
  const previewDemoMode = affirmative("WIRELINE_LAUNCH_DEMO_MODE");
  const previewInMemoryRateLimit = affirmative("WIRELINE_ALLOW_INMEMORY_RATE_LIMIT");
  const isolatedPreviewProjectRef = value("WIRELINE_PREVIEW_DATABASE_PROJECT_REF").toLowerCase();
  const isolatedPreviewDatabaseKeys =
    isolatedPreviewDatabase && previewDemoMode ? reviewedIsolatedPreviewDatabaseKeys : new Set();

  if (previewInMemoryRateLimit && (!isolatedPreviewDatabase || !previewDemoMode)) {
    failures.push(
      "WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: Preview override requires WIRELINE_PREVIEW_DATABASE_ISOLATED=true and WIRELINE_LAUNCH_DEMO_MODE=true",
    );
  }
  const configuredPreviewSpendAuthority = previewSpendAuthorityKeys.filter((name) => value(name));
  if (previewInMemoryRateLimit && configuredPreviewSpendAuthority.length) {
    failures.push(
      `WIRELINE_ALLOW_INMEMORY_RATE_LIMIT: provider-free Preview required; remove ${configuredPreviewSpendAuthority.join(", ")}`,
    );
  }

  if (isolatedPreviewDatabase) {
    if (!previewDemoMode) {
      failures.push(
        "WIRELINE_PREVIEW_DATABASE_ISOLATED: isolated Preview data requires WIRELINE_LAUNCH_DEMO_MODE=true",
      );
    }
    for (const name of reviewedIsolatedPreviewDatabaseKeys) {
      requireValue(name, "isolated authenticated Preview QA configuration is incomplete");
    }
    if (!/^[a-z0-9]{20}$/.test(isolatedPreviewProjectRef)) {
      failures.push(
        "WIRELINE_PREVIEW_DATABASE_PROJECT_REF: isolated Preview data requires the exact 20-character Supabase project ref",
      );
    } else if (isolatedPreviewProjectRef === CANONICAL_PRODUCTION_SUPABASE_PROJECT_REF) {
      failures.push(
        "WIRELINE_PREVIEW_DATABASE_PROJECT_REF: Preview must never target the canonical production Supabase project",
      );
    } else if (value("POSTGRES_URL")) {
      try {
        assertIsolatedPreviewDatabaseUrl({
          databaseUrl: value("POSTGRES_URL"),
          projectRef: isolatedPreviewProjectRef,
        });
      } catch (error) {
        failures.push(
          `POSTGRES_URL: ${error instanceof Error ? error.message : "isolated Preview database is invalid"}`,
        );
      }
    }
  }

  for (const name of productionOnlyPreviewKeys) {
    if (value(name) && !isolatedPreviewDatabaseKeys.has(name)) {
      failures.push(
        `${name}: production-only configuration must not be available to preview builds or runtime`,
      );
    }
  }

  for (const name of Object.keys(process.env)) {
    if (
      !productionOnlyPreviewKeySet.has(name) &&
      !reviewedPreviewCredentialKeys.has(name) &&
      !isolatedPreviewDatabaseKeys.has(name) &&
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

  if (affirmative("WIRELINE_SELF_SERVE_BILLING_ENABLED")) {
    failures.push(
      "WIRELINE_SELF_SERVE_BILLING_ENABLED: preview deployments must never expose self-serve paid checkout",
    );
  }

  if (
    value("WIRELINE_RUN_MIGRATIONS") === "true" &&
    value("WIRELINE_PREVIEW_DATABASE_ISOLATED") !== "true"
  ) {
    failures.push(
      "WIRELINE_RUN_MIGRATIONS: preview migrations require WIRELINE_PREVIEW_DATABASE_ISOLATED=true and a non-production database.",
    );
  }
  if (
    value("WIRELINE_RUN_MIGRATIONS") === "true" &&
    value("WIRELINE_PREVIEW_DATABASE_ISOLATED") === "true"
  ) {
    try {
      resolvePreviewMigrationDatabaseUrl({
        databaseUrl: value("POSTGRES_URL"),
        projectRef: value("WIRELINE_PREVIEW_DATABASE_PROJECT_REF"),
        sessionPoolerHost: value("WIRELINE_PREVIEW_DATABASE_SESSION_POOLER_HOST"),
      });
    } catch (error) {
      failures.push(
        `WIRELINE_RUN_MIGRATIONS: ${error instanceof Error ? error.message : "Preview migration database configuration is invalid"}`,
      );
    }
  }
}

if (failures.length) {
  console.error(`Deployment-boundary check failed for ${environment}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

for (const notice of notices) console.warn(`Deployment-boundary notice: ${notice}`);
console.log(`Deployment-boundary check passed for ${environment}.`);
