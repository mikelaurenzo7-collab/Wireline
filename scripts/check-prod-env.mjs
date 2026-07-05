#!/usr/bin/env node
// Production environment-variable check.
//
// Runs before deploy (manually invoked, or via CI) to surface missing
// secrets and launch-critical control-plane confirmations BEFORE they manifest
// as 500s, broken checkout, or avoidable security findings in production.
//
// Usage:
//   node scripts/check-prod-env.mjs
//   PRODUCTION_CHECK=1 npm run check-prod-env
//
// Exit codes:
//   0 - all required vars present, recommended vars present
//   1 - missing required vars
//   2 - missing recommended vars and PRODUCTION_CHECK=1

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
  ["ANTHROPIC_API_KEY", "Claude - required for /api/claude/* recipes"],
  ["OPENROUTER_API_KEY", "OpenRouter - required for default Grok tenant voice routing"],
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

  // Manual control-plane confirmation. Supabase Auth leaked-password protection
  // cannot be inferred from env locally, but the production advisor flagged it
  // disabled during the 2026-07-05 review. Set this confirmation only after
  // enabling it in Supabase Auth settings.
  [
    "SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED",
    "Set to true after enabling Supabase Auth leaked-password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection",
  ],

  // Current public subscription checkout is for shared capacity only.
  // These env names are transitional code identifiers mapped to the live
  // Wireline Team and Wireline Business products.
  ["STRIPE_BUSINESS_STARTER_PRICE_ID", "Wireline Team monthly capacity price"],
  ["STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID", "Wireline Team annual capacity price"],
  ["STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID", "Wireline Team extra-agent add-on"],
  ["STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID", "Wireline Team metered voice-overage price"],
  ["STRIPE_PRO_PRICE_ID", "Wireline Business monthly capacity price"],
  ["STRIPE_PRO_ANNUAL_PRICE_ID", "Wireline Business annual capacity price"],
  ["STRIPE_PRO_EXTRA_AGENT_PRICE_ID", "Wireline Business extra-agent add-on"],
  ["STRIPE_PRO_OVERAGE_PRICE_ID", "Wireline Business metered overage price"],

  ["STRIPE_VOICE_OVERAGE_METER_EVENT_NAME", "Stripe meter event name for voice-minute overage"],
  ["WIRELINE_DATA_KEY", "AES-256-GCM key for encrypting webhook secrets at rest"],
  ["CRON_SECRET", "Bearer token for cron job authentication"],
];

const optional = [
  ["OPENAI_API_KEY", "Optional GPT second-tier fallback / degraded-mode recovery"],
  ["GOOGLE_CLIENT_ID", "Gmail OAuth - disables email integration when unset"],
  ["GOOGLE_CLIENT_SECRET", "Gmail OAuth"],
  ["MICROSOFT_CLIENT_ID", "Outlook OAuth"],
  ["MICROSOFT_CLIENT_SECRET", "Outlook OAuth"],
  ["SENTRY_DSN", "Backend error monitoring"],
  ["VITE_SENTRY_DSN", "Frontend error monitoring"],
  ["CLAUDE_MONTHLY_BUDGET_USD", "Optional rolling-24h Claude spend alert threshold"],
  ["STRIPE_BUSINESS_PRICE_ID", "Reserved only if Enterprise self-serve checkout is re-enabled"],
  ["STRIPE_BUSINESS_ANNUAL_PRICE_ID", "Reserved only if Enterprise annual checkout is re-enabled"],
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
  ["HEYGEN_API_KEY", "Legacy alias for LIVEAVATAR_API_KEY"],
];

const jwtSecretConflict =
  process.env.INTERNAL_JWT_SECRET &&
  process.env.SUPABASE_JWT_SECRET &&
  process.env.INTERNAL_JWT_SECRET !== process.env.SUPABASE_JWT_SECRET;

const present = (key, value) => {
  const resolved = value ?? process.env[key];
  if (key === "SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED") return resolved === "true";
  return Boolean(resolved);
};
const missing = (vars) => vars.filter(([key, _description, value]) => !present(key, value));

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

const banner = (s) => `\n${"-".repeat(64)}\n  ${s}\n${"-".repeat(64)}`;

console.log(banner("Wireline - production env check"));

if (missingRequired.length === 0 && missingRecommended.length === 0) {
  console.log("OK: all required and recommended env vars/control-plane confirmations are set.\n");
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

if (missingRecommended.length) {
  console.log("\nMISSING RECOMMENDED env vars/control-plane confirmations (features or launch posture will be degraded):\n");
  missingRecommended.forEach(([k, d]) => console.log(`    - ${k}\n      ${d}`));
}

if (missingOptional.length) {
  console.log("\nMissing optional env vars (informational):");
  missingOptional.forEach(([k]) => console.log(`    - ${k}`));
}

console.log("");

if (missingRequired.length) process.exit(1);
if (process.env.PRODUCTION_CHECK === "1" && missingRecommended.length) process.exit(2);
process.exit(0);
