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
  [
    "OPENAI_API_KEY",
    "Continuity structured runtime and OpenAI Realtime sessions",
    process.env.OPENAI_API_KEY,
  ],
  [
    "VAPI_PRIVATE_KEY",
    "Vapi managed inbound, outbound, and protected browser voice runtime",
    process.env.VAPI_PRIVATE_KEY,
  ],
  ["VAPI_WEBHOOK_SECRET", "Vapi webhook HMAC secret", process.env.VAPI_WEBHOOK_SECRET],
  [
    "ELEVENLABS_API_KEY",
    "Server-only managed Studio TTS and authorized private voice cloning",
    process.env.ELEVENLABS_API_KEY,
  ],
  [
    "TWILIO_ACCOUNT_SID",
    "Twilio programmable voice and messaging account",
    process.env.TWILIO_ACCOUNT_SID,
  ],
  [
    "TWILIO_AUTH_TOKEN",
    "Twilio inbound webhook signature validation; rotate after any disclosure",
    process.env.TWILIO_AUTH_TOKEN,
  ],
  [
    "STRIPE_SECRET_KEY",
    "Stripe subscriptions, prepaid balances, and billing portal",
    process.env.STRIPE_SECRET_KEY,
  ],
  [
    "STRIPE_WEBHOOK_SECRET",
    "Stripe webhook signature verification",
    process.env.STRIPE_WEBHOOK_SECRET,
  ],
  [
    "RESEND_API_KEY",
    "Transactional email for verification, billing, and lifecycle delivery",
    process.env.RESEND_API_KEY,
  ],
];

const recommended = [
  [
    "FEDERAL_DNC_API_URL",
    "Federal DNC scrub endpoint — deferred checklist until business registration; marketing outbound fails closed without it",
  ],
  [
    "FEDERAL_DNC_API_KEY",
    "DNCScrub loginId — deferred checklist until business registration; never paste a Vercel vcp_ token here",
  ],
  [
    "DATABASE_POOL_URL",
    "Pooler URL the runtime prefers; POSTGRES_URL remains the supported fallback",
  ],
  ["OPENAI_API_KEY_CHATKIT", "Scoped ChatGPT app realtime voice key for spend isolation"],
  ["GEMINI_API_KEY", "Gemini continuity fallback when direct OpenAI is unavailable"],
  ["AI_GATEWAY_API_KEY", "Vercel AI Gateway governed final fallback and centralized budgets"],
  [
    "XAI_API_KEY",
    "Managed xAI credential — Grok 4.6 structured primary and Vapi Grok 4.3 PSTN default; OpenAI remains continuity and Realtime",
  ],
  ["TWILIO_API_KEY", "Scoped Twilio REST API key SID; preferred over the Account Auth Token"],
  ["TWILIO_API_SECRET", "Secret paired with TWILIO_API_KEY for production REST calls"],
  ["APP_URL", "Canonical URL for OAuth redirects and email links"],
  ["CORS_ORIGINS", "Production CORS allowlist"],
  [
    "WIRELINE_POSTAL_ADDRESS",
    "Valid physical postal address required before commercial email can send",
  ],
  ["VITE_STRIPE_PUBLIC_KEY", "Stripe publishable key for client-side checkout UI"],
  [
    "WIRELINE_RECONCILE_STRIPE_PORTAL",
    "Production fail-closed, read-only managed Customer Portal verification gate",
  ],

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
  ["STRIPE_LIVE_VIDEO_ADDON_PRICE_ID", "Retired Live Video SKU for leftover webhook matching"],

  ["WIRELINE_DATA_KEY", "AES-256-GCM key for encrypting webhook secrets at rest"],
  ["CRON_SECRET", "Bearer token for cron job authentication"],
];

const optional = [
  [
    "PERPLEXITY_API_KEY",
    "Preferred live public-research vendor; grounded Gemini covers when unset",
  ],
  ["XAI_API_KEY_CHATKIT", "Optional isolated xAI experiment key"],
  [
    "WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK",
    "Operator opt-out for the xAI structured lane — unset means active with a key; set false to disable",
  ],
  [
    "WIRELINE_LAUNCH_DEMO_MODE",
    "Mark launch telemetry as demo-only until real customers are admitted",
  ],
  ["GOOGLE_CLIENT_ID", "Gmail OAuth - disables email integration when unset"],
  ["GOOGLE_CLIENT_SECRET", "Gmail OAuth"],
  ["MICROSOFT_CLIENT_ID", "Outlook OAuth"],
  ["MICROSOFT_CLIENT_SECRET", "Outlook OAuth"],
  ["SENTRY_DSN", "Backend + browser error monitoring (browser reports via /api/health/report)"],
  // VITE_SENTRY_DSN is intentionally absent: the browser reporter beacons to
  // /api/health/report and the server forwards with SENTRY_DSN. A build-time
  // browser DSN is not read by app code.
  ["CLAUDE_MONTHLY_BUDGET_USD", "Legacy alias for rolling-24h AI spend alert threshold"],
  [
    "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
    "Reserved only if Enterprise add-on checkout is re-enabled",
  ],
  [
    "STRIPE_BUSINESS_OVERAGE_PRICE_ID",
    "Reserved only if Enterprise metered checkout is re-enabled",
  ],
];

const formatHints = new Map([
  ["POSTGRES_URL", "postgresql://user:pass@host:port/db (host must be dotted, localhost, or IP)"],
  ["DATABASE_POOL_URL", "postgresql://user:pass@pooler-host:6543/db"],
  ["TWILIO_ACCOUNT_SID", "AC followed by 32 hexadecimal characters"],
  ["TWILIO_API_KEY", "SK followed by 32 hexadecimal characters"],
  ["FEDERAL_DNC_API_URL", "https://vendor.example/api/dnc-check"],
]);

function configuredValue([key, _description, value]) {
  return value ?? process.env[key];
}

function isValidEnvValue(key, value) {
  if (!value) return true;
  if (key === "POSTGRES_URL" || key === "DATABASE_POOL_URL") {
    return isPostgresConnectionString(value);
  }
  if (key === "TWILIO_ACCOUNT_SID") return /^AC[a-fA-F0-9]{32}$/.test(String(value).trim());
  if (key === "TWILIO_API_KEY") return /^SK[a-fA-F0-9]{32}$/.test(String(value).trim());
  if (key === "FEDERAL_DNC_API_URL") {
    try {
      return new URL(String(value).trim()).protocol === "https:";
    } catch {
      return false;
    }
  }
  if (key === "FEDERAL_DNC_API_KEY") {
    const trimmed = String(value).trim();
    // Same rejection as src/lib/federal-dnc-service.ts — Vercel tokens have been
    // pasted here by mistake and make presence-only checks lie.
    if (/^vcp_/i.test(trimmed) || /^vercel_/i.test(trimmed)) return false;
    return trimmed.length >= 8;
  }
  if (key === "STRIPE_SECRET_KEY") {
    return /^(?:sk|rk)_(?:test|live)_/.test(String(value).trim());
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

const twilioApiKeyPairPartial =
  Boolean(process.env.TWILIO_API_KEY?.trim()) !== Boolean(process.env.TWILIO_API_SECRET?.trim());

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
const missingRecommended = [
  ...(twilioApiKeyPairPartial
    ? [
        [
          "TWILIO_API_KEY / TWILIO_API_SECRET",
          "The scoped Twilio REST credential must be configured as a complete key/secret pair.",
        ],
      ]
    : []),
  ...missing(recommended),
];
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
    missingOptional.forEach(([key, description]) => console.log(`    - ${key} - ${description}`));
  }
  process.exit(0);
}

if (missingRequired.length) {
  console.log("MISSING REQUIRED env vars (deploy will fail):\n");
  missingRequired.forEach(([key, description]) => console.log(`    - ${key}\n      ${description}`));
}

if (invalidRequired.length) {
  console.log("\nINVALID REQUIRED env vars (deploy will fail):\n");
  invalidRequired.forEach(([key, description]) => {
    const hint = formatHints.get(key);
    console.log(`    - ${key}\n      ${description}${hint ? `\n      Expected: ${hint}` : ""}`);
  });
}

if (missingRecommended.length) {
  console.log("\nMISSING RECOMMENDED env vars (features will be degraded):\n");
  missingRecommended.forEach(([key, description]) => console.log(`    - ${key}\n      ${description}`));
}

if (invalidRecommended.length) {
  console.log("\nINVALID RECOMMENDED env vars (features will be degraded or ignored):\n");
  invalidRecommended.forEach(([key, description]) => {
    const hint = formatHints.get(key);
    console.log(`    - ${key}\n      ${description}${hint ? `\n      Expected: ${hint}` : ""}`);
  });
}

if (missingOptional.length) {
  console.log("\nMissing optional env vars (informational):");
  missingOptional.forEach(([key]) => console.log(`    - ${key}`));
}

console.log("");

if (missingRequired.length || invalidRequired.length) process.exit(1);
if (
  process.env.PRODUCTION_CHECK === "1" &&
  (missingRecommended.length || invalidRecommended.length)
) {
  process.exit(2);
}
process.exit(0);
