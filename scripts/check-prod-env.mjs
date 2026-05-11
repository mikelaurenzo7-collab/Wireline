#!/usr/bin/env node
// Production environment-variable check.
//
// Runs before deploy (manually invoked, or via CI) to surface missing
// secrets BEFORE they manifest as 500s in production.
//
// Usage:
//   node scripts/check-prod-env.mjs            # checks process.env
//   PRODUCTION_CHECK=1 npm run check-prod-env  # forces strict mode in CI
//
// Exit codes:
//   0 — all required vars present, recommended vars present
//   1 — missing required vars (always a hard fail)
//   2 — missing recommended vars and PRODUCTION_CHECK=1 (CI hardening)

const required = [
  ["VITE_SUPABASE_URL",         "Supabase project URL — frontend + backend"],
  ["VITE_SUPABASE_ANON_KEY",    "Supabase anon key — frontend client"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service role — backend privileged ops"],
  ["OAUTH_STATE_SECRET",        "HMAC secret for OAuth CSRF state tokens — required in prod; dev falls back to STRIPE_WEBHOOK_SECRET"],
];

const recommended = [
  ["ANTHROPIC_API_KEY",         "Claude — required for /api/claude/* recipes"],
  ["VITE_VAPI_PUBLIC_KEY",      "Vapi — required for browser-side test calls from the dashboard"],
  ["VAPI_PRIVATE_KEY",          "Vapi — required for outbound/inbound voice agents"],
  ["VAPI_WEBHOOK_SECRET",       "Vapi webhook auth — REJECTS webhooks in prod when unset"],
  ["APP_URL",                   "Canonical URL — required for OAuth redirects + email links"],
  ["CORS_ORIGINS",              "CORS allowlist — required in prod or browser API calls fail"],
  ["STRIPE_SECRET_KEY",         "Stripe — billing endpoints return 503 when unset"],
  ["STRIPE_WEBHOOK_SECRET",     "Stripe webhook signature verification"],
  ["STRIPE_STARTER_PRICE_ID",   "Stripe price ID for the Starter plan"],
  ["STRIPE_PRO_PRICE_ID",       "Stripe price ID for the Pro plan"],
  ["STRIPE_ENTERPRISE_PRICE_ID","Stripe price ID for the Enterprise plan"],
  ["WIRELINE_DATA_KEY",         "AES-256-GCM key for webhook secret vault — POST/PATCH /api/webhooks with a signing secret returns 503 when unset"],
  ["CRON_SECRET",               "Bearer token for /api/jobs/sweep cron — required (≥16 chars) when invoking sweep from a scheduler"],
];

const optional = [
  ["GEMINI_API_KEY",           "Gemini fallback for legacy paths"],
  ["GOOGLE_CLIENT_ID",         "Gmail OAuth — disables email integration when unset"],
  ["GOOGLE_CLIENT_SECRET",     "Gmail OAuth"],
  ["MICROSOFT_CLIENT_ID",      "Outlook OAuth"],
  ["MICROSOFT_CLIENT_SECRET",  "Outlook OAuth"],
  ["SENTRY_DSN",               "Backend error monitoring"],
  ["VITE_SENTRY_DSN",          "Frontend error monitoring"],
  ["UPSTASH_REDIS_REST_URL",   "Distributed rate-limit store (in-memory fallback otherwise)"],
  ["UPSTASH_REDIS_REST_TOKEN", "Upstash Redis token"],
  ["CLAUDE_MONTHLY_BUDGET_USD","Monthly Claude spend cap in USD (default $50; 1 % daily safety valve)"],
];

const missing = (vars) => vars.filter(([k]) => !process.env[k]);

const missingRequired    = missing(required);
const missingRecommended = missing(recommended);
const missingOptional    = missing(optional);

const banner = (s) => `\n${"━".repeat(64)}\n  ${s}\n${"━".repeat(64)}`;

console.log(banner("Wireline · production env check"));

if (missingRequired.length === 0 && missingRecommended.length === 0) {
  console.log("✓ All required and recommended env vars are set.\n");
  if (missingOptional.length) {
    console.log("  Optional (informational only):");
    missingOptional.forEach(([k, d]) => console.log(`    · ${k} — ${d}`));
  }
  process.exit(0);
}

if (missingRequired.length) {
  console.log("✗ MISSING REQUIRED env vars (deploy will fail):\n");
  missingRequired.forEach(([k, d]) => console.log(`    · ${k}\n      ${d}`));
}

if (missingRecommended.length) {
  console.log("\n⚠ MISSING RECOMMENDED env vars (features will be degraded):\n");
  missingRecommended.forEach(([k, d]) => console.log(`    · ${k}\n      ${d}`));
}

if (missingOptional.length) {
  console.log("\n· Missing optional env vars (informational):");
  missingOptional.forEach(([k]) => console.log(`    · ${k}`));
}

console.log("");

if (missingRequired.length) process.exit(1);
if (process.env.PRODUCTION_CHECK === "1" && missingRecommended.length) process.exit(2);
process.exit(0);
