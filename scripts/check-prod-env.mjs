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
//   0 — all required vars present, recommended vars present
//   1 — missing required vars
//   2 — missing recommended vars and PRODUCTION_CHECK=1

const required = [
  ["POSTGRES_URL", "Postgres connection string for Drizzle-backed API routes", process.env.POSTGRES_URL],
  [
    "INTERNAL_JWT_SECRET",
    "Session JWT signing — canonical Wireline session secret (legacy alias: SUPABASE_JWT_SECRET)",
    process.env.INTERNAL_JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
  ],
  ["OAUTH_STATE_SECRET", "HMAC secret for OAuth CSRF state tokens", process.env.OAUTH_STATE_SECRET],
  ["UPSTASH_REDIS_REST_URL", "Distributed rate-limit store for Vercel", process.env.UPSTASH_REDIS_REST_URL],
  ["UPSTASH_REDIS_REST_TOKEN", "Upstash Redis token", process.env.UPSTASH_REDIS_REST_TOKEN],
  ["VAPI_WEBHOOK_SECRET", "Vapi webhook HMAC secret", process.env.VAPI_WEBHOOK_SECRET],
];

const recommended = [
  ["ANTHROPIC_API_KEY", "Claude — required for /api/claude/* recipes"],
  ["OPENROUTER_API_KEY", "OpenRouter — required for default Grok tenant voice routing"],
  ["WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL", "Launch default: x-ai/grok-4.3"],
  ["GEMINI_API_KEY", "Gemini Flash fallback when OpenRouter/Grok is unavailable"],
  ["VITE_VAPI_PUBLIC_KEY", "Vapi browser-side test calls"],
  ["VAPI_PRIVATE_KEY", "Vapi outbound/inbound voice agents"],
  ["TWILIO_AUTH_TOKEN", "Twilio inbound SMS signature validation", process.env.TWILIO_AUTH_TOKEN],
  ["APP_URL", "Canonical URL for OAuth redirects and email links"],
  ["CORS_ORIGINS", "Production CORS allowlist"],
  ["STRIPE_SECRET_KEY", "Stripe billing endpoints"],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhook signature verification"],
  ["VITE_STRIPE_PUBLIC_KEY", "Stripe publishable key for client-side checkout UI"],

  // Current customer-facing plan catalog:
  // personal, personal-plus, starter(Business Growth), scale.
  // Runtime compatibility note: Business Growth currently uses historical
  // STRIPE_PRO_* env names and Scale uses historical STRIPE_BUSINESS_* env
  // names until new Stripe prices are created and synced.
  ["STRIPE_PERSONAL_PRICE_ID", "Personal monthly price ($9/mo)"],
  ["STRIPE_PERSONAL_ANNUAL_PRICE_ID", "Personal annual price ($86/yr)"],
  ["STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID", "Personal extra-agent add-on"],
  ["STRIPE_PERSONAL_OVERAGE_PRICE_ID", "Personal metered voice-overage price"],

  ["STRIPE_PERSONAL_PLUS_PRICE_ID", "Personal+ monthly price ($19/mo) — currently missing blocks self-serve checkout for this tier"],
  ["STRIPE_PERSONAL_PLUS_ANNUAL_PRICE_ID", "Personal+ annual price ($182/yr)"],
  ["STRIPE_PERSONAL_PLUS_EXTRA_AGENT_PRICE_ID", "Personal+ extra-agent add-on"],
  ["STRIPE_PERSONAL_PLUS_OVERAGE_PRICE_ID", "Personal+ metered voice-overage price"],

  ["STRIPE_BUSINESS_STARTER_PRICE_ID", "Business Starter monthly price ($99/mo)"],
  ["STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID", "Business Starter annual price ($950/yr)"],
  ["STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID", "Business Starter extra-agent add-on"],
  ["STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID", "Business Starter metered voice-overage price"],

  ["STRIPE_PRO_PRICE_ID", "Business Growth monthly price ($249/mo), legacy env name"],
  ["STRIPE_PRO_ANNUAL_PRICE_ID", "Business Growth annual price ($2,390/yr), legacy env name"],
  ["STRIPE_PRO_EXTRA_AGENT_PRICE_ID", "Business Growth extra-agent add-on, legacy env name"],
  ["STRIPE_PRO_OVERAGE_PRICE_ID", "Business Growth metered overage, legacy env name"],

  ["STRIPE_BUSINESS_PRICE_ID", "Scale monthly price ($699/mo), legacy env name"],
  ["STRIPE_BUSINESS_ANNUAL_PRICE_ID", "Scale annual price ($6,710/yr), legacy env name"],
  ["STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID", "Scale extra-agent add-on, legacy env name"],
  ["STRIPE_BUSINESS_OVERAGE_PRICE_ID", "Scale metered overage, legacy env name"],

  ["STRIPE_VOICE_OVERAGE_METER_EVENT_NAME", "Stripe meter event name for voice-minute overage"],
  ["WIRELINE_DATA_KEY", "AES-256-GCM key for encrypting webhook secrets at rest"],
  ["CRON_SECRET", "Bearer token for cron job authentication"],
];

const optional = [
  ["OPENAI_API_KEY", "Optional GPT second-tier fallback / degraded-mode recovery"],
  ["GOOGLE_CLIENT_ID", "Gmail OAuth — disables email integration when unset"],
  ["GOOGLE_CLIENT_SECRET", "Gmail OAuth"],
  ["MICROSOFT_CLIENT_ID", "Outlook OAuth"],
  ["MICROSOFT_CLIENT_SECRET", "Outlook OAuth"],
  ["SENTRY_DSN", "Backend error monitoring"],
  ["VITE_SENTRY_DSN", "Frontend error monitoring"],
  ["CLAUDE_MONTHLY_BUDGET_USD", "Optional rolling-24h Claude spend alert threshold"],
];

const jwtSecretConflict =
  process.env.INTERNAL_JWT_SECRET &&
  process.env.SUPABASE_JWT_SECRET &&
  process.env.INTERNAL_JWT_SECRET !== process.env.SUPABASE_JWT_SECRET;

const missing = (vars) => vars.filter(([k, _d, value]) => !(value ?? process.env[k]));

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
