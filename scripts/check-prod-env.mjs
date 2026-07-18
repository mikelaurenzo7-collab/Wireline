#!/usr/bin/env node
// Production environment-variable check.
//
// Runs before deploy (manually invoked, or via CI) to surface missing
// secrets BEFORE they manifest as 500s in production.
//
// Usage:
//   node scripts/check-prod-env.mjs
//   PRODUCTION_CHECK=1 npm run check-prod-env
//
// Exit codes:
//   0 - all required vars present, recommended vars present
//   1 - missing/invalid required vars
//   2 - missing/invalid recommended vars and PRODUCTION_CHECK=1

const postgresProtocols = new Set(["postgres:", "postgresql:"]);
const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const ipv4Re = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isLikelyResolvableDatabaseHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  if (!host) return false;
  if (localDatabaseHosts.has(host)) return true;
  if (ipv4Re.test(host)) return true;
  if (host.includes(":")) return true;
  return host.includes(".");
}

function isPostgresConnectionString(value) {
  if (!String(value || "").trim()) return false;
  try {
    const url = new URL(String(value).trim());
    return (
      postgresProtocols.has(url.protocol) &&
      Boolean(url.hostname) &&
      isLikelyResolvableDatabaseHost(url.hostname) &&
      Boolean(url.pathname && url.pathname !== "/")
    );
  } catch {
    return false;
  }
}

const required = [
  [
    "POSTGRES_URL",
    "Postgres connection string for Drizzle-backed API routes",
    process.env.POSTGRES_URL,
  ],
  [
    "INTERNAL_JWT_SECRET",
    "Session JWT signing - canonical Wireline session secret (legacy alias: SUPABASE_JWT_SECRET)",
    process.env.INTERNAL_JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
  ],
  ["OAUTH_STATE_SECRET", "HMAC secret for OAuth CSRF state tokens", process.env.OAUTH_STATE_SECRET],
  [
    "UPSTASH_REDIS_REST_URL",
    "Distributed rate-limit store for Vercel",
    process.env.UPSTASH_REDIS_REST_URL,
  ],
  ["UPSTASH_REDIS_REST_TOKEN", "Upstash Redis token", process.env.UPSTASH_REDIS_REST_TOKEN],
  ["VAPI_WEBHOOK_SECRET", "Vapi webhook HMAC secret", process.env.VAPI_WEBHOOK_SECRET],
];

const recommended = [
  [
    "DATABASE_POOL_URL",
    "Pooler URL the runtime prefers; env-validator marks it required in production (falls back to POSTGRES_URL)",
  ],
  ["OPENAI_API_KEY", "Direct OpenAI fallback and OpenAI Realtime sessions"],
  ["GEMINI_API_KEY", "Gemini fallback when OpenAI or AI Gateway is unavailable"],
  ["VITE_VAPI_PUBLIC_KEY", "Vapi browser-side test calls"],
  ["VAPI_PRIVATE_KEY", "Vapi outbound/inbound voice agents"],
  ["TWILIO_AUTH_TOKEN", "Twilio inbound SMS signature validation", process.env.TWILIO_AUTH_TOKEN],
  ["APP_URL", "Canonical URL for OAuth redirects and email links"],
  ["CORS_ORIGINS", "Production CORS allowlist"],
  ["STRIPE_SECRET_KEY", "Stripe billing endpoints"],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhook signature verification"],
  ["VITE_STRIPE_PUBLIC_KEY", "Stripe publishable key for client-side checkout UI"],

  // Canonical Founder Early Access catalog. These keys mirror
  // src/lib/plan-catalog.ts and scripts/lib/stripe-founder-catalog.mjs.
  ["STRIPE_STARTER_9_PRICE_ID", "Wireline Starter monthly price"],
  ["STRIPE_STARTER_9_ANNUAL_PRICE_ID", "Wireline Starter annual price"],
  ["STRIPE_STARTER_PRICE_ID", "Wireline Starter Plus monthly price"],
  ["STRIPE_STARTER_ANNUAL_PRICE_ID", "Wireline Starter Plus annual price"],
  ["STRIPE_TEAM_PRICE_ID", "Wireline Pro monthly price"],
  ["STRIPE_TEAM_ANNUAL_PRICE_ID", "Wireline Pro annual price"],
  ["STRIPE_BUSINESS_PRICE_ID", "Wireline Business monthly price"],
  ["STRIPE_BUSINESS_ANNUAL_PRICE_ID", "Wireline Business annual price"],
  ["STRIPE_EXTRA_AGENT_PRICE_ID", "Extra Agent + 50 Minutes recurring add-on"],
  ["STRIPE_LIVE_VIDEO_ADDON_PRICE_ID", "Live Video recurring add-on"],

  ["WIRELINE_DATA_KEY", "AES-256-GCM key for encrypting webhook secrets at rest"],
  ["CRON_SECRET", "Bearer token for cron job authentication"],
];

const optional = [
  ["OPENROUTER_API_KEY", "Explicit per-agent custom-model pass-through"],
  ["WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL", "Default OpenRouter model when a tenant opts in"],
  ["GOOGLE_CLIENT_ID", "Gmail OAuth - disables email integration when unset"],
  ["GOOGLE_CLIENT_SECRET", "Gmail OAuth"],
  ["MICROSOFT_CLIENT_ID", "Outlook OAuth"],
  ["MICROSOFT_CLIENT_SECRET", "Outlook OAuth"],
  ["SENTRY_DSN", "Backend error monitoring"],
  ["VITE_SENTRY_DSN", "Frontend error monitoring"],
  ["CLAUDE_MONTHLY_BUDGET_USD", "Legacy alias for rolling-24h AI spend alert threshold"],
  [
    "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
    "Reserved only if Enterprise add-on checkout is re-enabled",
  ],
  [
    "STRIPE_BUSINESS_OVERAGE_PRICE_ID",
    "Reserved only if Enterprise metered checkout is re-enabled",
  ],
  [
    "LIVEAVATAR_API_KEY",
    "Live video presenter (HeyGen LiveAvatar) — business agent on-screen faces",
  ],
  [
    "LIVEAVATAR_DEFAULT_AVATAR_ID",
    "Default LiveAvatar catalog UUID assigned to new business agents",
  ],
  ["LIVEAVATAR_SANDBOX", "Force sandbox sessions (true/false; auto in non-production)"],
  ["HEYGEN_API_KEY", "Optional HeyGen Studio key for presenter voice previews"],
];

const formatHints = new Map([
  ["POSTGRES_URL", "postgresql://user:pass@host:port/db (host must be dotted, localhost, or IP)"],
  ["DATABASE_POOL_URL", "postgresql://user:pass@pooler-host:6543/db"],
]);

function configuredValue([key, _description, value]) {
  return value ?? process.env[key];
}

function isValidEnvValue(key, value) {
  if (!value) return true;
  if (key === "POSTGRES_URL" || key === "DATABASE_POOL_URL") {
    return isPostgresConnectionString(value);
  }
  return true;
}

function invalid(vars) {
  return vars.filter((entry) => {
    const value = configuredValue(entry);
    return Boolean(value) && !isValidEnvValue(entry[0], value);
  });
}

const jwtSecretConflict =
  process.env.INTERNAL_JWT_SECRET &&
  process.env.SUPABASE_JWT_SECRET &&
  process.env.INTERNAL_JWT_SECRET !== process.env.SUPABASE_JWT_SECRET;

const missing = (vars) => vars.filter((entry) => !configuredValue(entry));

const missingRequired = jwtSecretConflict
  ? [
      [
        "INTERNAL_JWT_SECRET / SUPABASE_JWT_SECRET",
        "Both are set but differ. Keep INTERNAL_JWT_SECRET as canonical; remove SUPABASE_JWT_SECRET after confirming sessions no longer depend on it.",
      ],
      ...missing(required),
    ]
  : missing(required);
const missingRecommended = missing(recommended);
const missingOptional = missing(optional);
const invalidRequired = invalid(required);
const invalidRecommended = invalid(recommended);

const banner = (s) => `\n${"-".repeat(64)}\n  ${s}\n${"-".repeat(64)}`;

console.log(banner("Wireline - production env check"));

if (
  missingRequired.length === 0 &&
  invalidRequired.length === 0 &&
  missingRecommended.length === 0 &&
  invalidRecommended.length === 0
) {
  console.log("OK: all required and recommended env vars are set and shaped correctly.\n");
  if (missingOptional.length) {
    console.log("  Optional (informational only):");
    missingOptional.forEach(([k, d]) => console.log(`    - ${k} - ${d}`));
  }
  process.exit(0);
}

if (missingRequired.length) {
  console.log("MISSING REQUIRED env vars (deploy will fail):\n");
  missingRequired.forEach(([k, d]) => console.log(`    - ${k}\n      ${d}`));
}

if (invalidRequired.length) {
  console.log("\nINVALID REQUIRED env vars (deploy will fail):\n");
  invalidRequired.forEach(([k, d]) => {
    const hint = formatHints.get(k);
    console.log(`    - ${k}\n      ${d}${hint ? `\n      Expected: ${hint}` : ""}`);
  });
}

if (missingRecommended.length) {
  console.log("\nMISSING RECOMMENDED env vars (features will be degraded):\n");
  missingRecommended.forEach(([k, d]) => console.log(`    - ${k}\n      ${d}`));
}

if (invalidRecommended.length) {
  console.log("\nINVALID RECOMMENDED env vars (features will be degraded or ignored):\n");
  invalidRecommended.forEach(([k, d]) => {
    const hint = formatHints.get(k);
    console.log(`    - ${k}\n      ${d}${hint ? `\n      Expected: ${hint}` : ""}`);
  });
}

if (missingOptional.length) {
  console.log("\nMissing optional env vars (informational):");
  missingOptional.forEach(([k]) => console.log(`    - ${k}`));
}

console.log("");

if (missingRequired.length || invalidRequired.length) process.exit(1);
if (process.env.PRODUCTION_CHECK === "1" && (missingRecommended.length || invalidRecommended.length)) {
  process.exit(2);
}
process.exit(0);
