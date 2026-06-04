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
  [
    "POSTGRES_URL",
    "Postgres connection string for Drizzle-backed API routes",
    process.env.POSTGRES_URL,
  ],
  [
    "INTERNAL_JWT_SECRET",
    "Session JWT signing — canonical Wireline session secret (legacy alias: SUPABASE_JWT_SECRET)",
    process.env.INTERNAL_JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
  ],
  [
    "OAUTH_STATE_SECRET",
    "HMAC secret for OAuth CSRF state tokens — required in prod; dev falls back to STRIPE_WEBHOOK_SECRET",
    process.env.OAUTH_STATE_SECRET,
  ],
  [
    "UPSTASH_REDIS_REST_URL",
    "Distributed rate-limit store — required for global abuse protection on Vercel",
    process.env.UPSTASH_REDIS_REST_URL,
  ],
  [
    "UPSTASH_REDIS_REST_TOKEN",
    "Upstash Redis token",
    process.env.UPSTASH_REDIS_REST_TOKEN,
  ],
  [
    "VAPI_WEBHOOK_SECRET",
    "Vapi webhook HMAC — voice observability rejects unsigned callbacks in prod when unset",
    process.env.VAPI_WEBHOOK_SECRET,
  ],
];

const recommended = [
  ["ANTHROPIC_API_KEY", "Claude — required for /api/claude/* recipes"],
  ["VITE_VAPI_PUBLIC_KEY", "Vapi — required for browser-side test calls from the dashboard"],
  ["VAPI_PRIVATE_KEY", "Vapi — required for outbound/inbound voice agents"],
  ["APP_URL", "Canonical URL — required for OAuth redirects + email links"],
  ["CORS_ORIGINS", "CORS allowlist — required in prod or browser API calls fail"],
  ["STRIPE_SECRET_KEY", "Stripe — billing endpoints return 503 when unset"],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhook signature verification"],
  ["VITE_STRIPE_PUBLIC_KEY", "Stripe publishable key for client-side checkout UI"],
  ["STRIPE_PERSONAL_PRICE_ID", "Stripe monthly price — Personal"],
  ["STRIPE_PERSONAL_ANNUAL_PRICE_ID", "Stripe annual price — Personal"],
  ["STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID", "Stripe extra-agent add-on — Personal"],
  ["STRIPE_STARTER_PRICE_ID", "Stripe monthly price — Starter"],
  ["STRIPE_STARTER_ANNUAL_PRICE_ID", "Stripe annual price — Starter"],
  ["STRIPE_STARTER_EXTRA_AGENT_PRICE_ID", "Stripe extra-agent add-on — Starter"],
  ["STRIPE_PRO_PRICE_ID", "Stripe monthly price — Pro"],
  ["STRIPE_PRO_ANNUAL_PRICE_ID", "Stripe annual price — Pro"],
  ["STRIPE_PRO_EXTRA_AGENT_PRICE_ID", "Stripe extra-agent add-on — Pro"],
  ["STRIPE_BUSINESS_PRICE_ID", "Stripe monthly price — Business"],
  ["STRIPE_BUSINESS_ANNUAL_PRICE_ID", "Stripe annual price — Business"],
  ["STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID", "Stripe extra-agent add-on — Business"],
  [
    "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
    "Stripe extra-agent add-on — Business",
  ],
  ["STRIPE_PERSONAL_OVERAGE_PRICE_ID", "Stripe metered voice-overage price — Personal"],
  ["STRIPE_STARTER_OVERAGE_PRICE_ID", "Stripe metered voice-overage price — Starter"],
  ["STRIPE_PRO_OVERAGE_PRICE_ID", "Stripe metered voice-overage price — Pro"],
  ["STRIPE_BUSINESS_OVERAGE_PRICE_ID", "Stripe metered voice-overage price — Business"],
  [
    "STRIPE_VOICE_OVERAGE_METER_EVENT_NAME",
    "Stripe meter event name for voice-minute overage (voice_minutes_overage)",
  ],
  [
    "WIRELINE_DATA_KEY",
    "AES-256-GCM key for encrypting webhook secrets at rest — webhooks with signing secrets fail when unset",
  ],
  ["CRON_SECRET", "Bearer token for cron job authentication — scheduled jobs fail when unset"],
];

const optional = [
  ["GEMINI_API_KEY", "Gemini fallback for legacy paths"],
  ["OPENAI_API_KEY", "Optional GPT second-tier fallback / degraded-mode recovery"],
  ["GOOGLE_CLIENT_ID", "Gmail OAuth — disables email integration when unset"],
  ["GOOGLE_CLIENT_SECRET", "Gmail OAuth"],
  ["MICROSOFT_CLIENT_ID", "Outlook OAuth"],
  ["MICROSOFT_CLIENT_SECRET", "Outlook OAuth"],
  ["SENTRY_DSN", "Backend error monitoring"],
  ["VITE_SENTRY_DSN", "Frontend error monitoring"],
  [
    "CLAUDE_MONTHLY_BUDGET_USD",
    "Monthly Claude spend cap in USD (default $50; 1 % daily safety valve)",
  ],
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
