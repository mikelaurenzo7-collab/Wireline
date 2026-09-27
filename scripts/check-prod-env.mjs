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
    "APP_URL",
    "Canonical BotBound origin for OAuth redirects, email links, billing returns, and provider callbacks",
    process.env.APP_URL,
  ],
  [
    "POSTGRES_URL",
    "Postgres connection string for Drizzle-backed API routes",
    process.env.POSTGRES_URL,
  ],
  [
    "DATABASE_POOL_URL",
    "Serverless transaction-pool connection for production runtime traffic",
    process.env.DATABASE_POOL_URL,
  ],
  [
    "INTERNAL_JWT_SECRET",
    "Session JWT signing - canonical BotBound session secret (legacy alias: SUPABASE_JWT_SECRET)",
    process.env.INTERNAL_JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
  ],
  ["OAUTH_STATE_SECRET", "HMAC secret for OAuth CSRF state tokens", process.env.OAUTH_STATE_SECRET],
  [
    "OAUTH_BRIDGE_SECRET",
    "MCP authorization bridge signing secret",
    process.env.OAUTH_BRIDGE_SECRET,
  ],
  [
    "MCP_OAUTH_TOKEN_PEPPER",
    "Pepper for irreversibly hashing MCP OAuth tokens",
    process.env.MCP_OAUTH_TOKEN_PEPPER,
  ],
  ["WIRELINE_DATA_KEY", "AES-256-GCM key for tenant credentials", process.env.WIRELINE_DATA_KEY],
  [
    "UPSTASH_REDIS_REST_URL",
    "Distributed rate-limit store for Vercel",
    process.env.UPSTASH_REDIS_REST_URL,
  ],
  ["UPSTASH_REDIS_REST_TOKEN", "Upstash Redis token", process.env.UPSTASH_REDIS_REST_TOKEN],
  [
    "OPENAI_API_KEY",
    "Managed GPT-5.6 Terra structured runtime and all OpenAI Realtime sessions",
    process.env.OPENAI_API_KEY,
  ],
  ["OPENAI_PROJECT_ID", "OpenAI Realtime SIP project binding", process.env.OPENAI_PROJECT_ID],
  [
    "OPENAI_WEBHOOK_SECRET",
    "Signature verification for OpenAI Realtime incoming-call events",
    process.env.OPENAI_WEBHOOK_SECRET,
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
  ["TWILIO_API_KEY", "Scoped Twilio REST API key SID", process.env.TWILIO_API_KEY],
  [
    "TWILIO_API_SECRET",
    "Secret paired with the scoped Twilio REST API key",
    process.env.TWILIO_API_SECRET,
  ],
  [
    "TWILIO_WEBHOOK_BASE_URL",
    "Canonical BotBound origin for Twilio signatures and callback delivery",
    process.env.TWILIO_WEBHOOK_BASE_URL,
  ],
  [
    "PLATFORM_SMS_FROM",
    "BotBound-owned sender for operational escalation",
    process.env.PLATFORM_SMS_FROM,
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
  [
    "AGENTMAIL_API_KEY",
    "Production-only platform credential for paid Bot managed mailboxes",
    process.env.AGENTMAIL_API_KEY,
  ],
  [
    "AGENTMAIL_DEFAULT_DOMAIN",
    "Verified botbound.app domain or subdomain for managed Bot mailboxes",
    process.env.AGENTMAIL_DEFAULT_DOMAIN,
  ],
  [
    "VITE_STRIPE_PUBLIC_KEY",
    "Live Stripe publishable key for checkout UI",
    process.env.VITE_STRIPE_PUBLIC_KEY,
  ],
  ["CRON_SECRET", "Bearer token for scheduled-job authentication", process.env.CRON_SECRET],
  [
    "WIRELINE_RECONCILE_STRIPE_PORTAL",
    "Fail-closed managed Customer Portal verification gate",
    process.env.WIRELINE_RECONCILE_STRIPE_PORTAL,
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
  ["OPENAI_API_KEY_CHATKIT", "Scoped ChatGPT app realtime voice key for spend isolation"],
  ["GEMINI_API_KEY", "Gemini continuity fallback when direct OpenAI is unavailable"],
  ["AI_GATEWAY_API_KEY", "Vercel AI Gateway governed final fallback and centralized budgets"],
  ["CORS_ORIGINS", "Production CORS allowlist"],
  [
    "WIRELINE_POSTAL_ADDRESS",
    "Valid physical postal address required before commercial email can send",
  ],

  // New-sale channel catalog. These keys mirror
  // src/lib/plan-catalog.ts and scripts/lib/stripe-founder-catalog.mjs.
  ["STRIPE_VOICE_PRICE_ID", "BotBound Calls monthly price"],
  ["STRIPE_VOICE_ANNUAL_PRICE_ID", "BotBound Calls annual price"],
  ["STRIPE_EMAIL_PRICE_ID", "BotBound Email monthly price"],
  ["STRIPE_EMAIL_ANNUAL_PRICE_ID", "BotBound Email annual price"],
  ["STRIPE_VOICE_EMAIL_PRICE_ID", "BotBound Calls + Email monthly price"],
  ["STRIPE_VOICE_EMAIL_ANNUAL_PRICE_ID", "BotBound Calls + Email annual price"],
  ["STRIPE_VOICE_REGULAR_PRICE_ID", "BotBound Calls regular monthly price"],
  ["STRIPE_VOICE_REGULAR_ANNUAL_PRICE_ID", "BotBound Calls regular annual price"],
  ["STRIPE_VOICE_HIGH_PRICE_ID", "BotBound Calls high monthly price"],
  ["STRIPE_VOICE_HIGH_ANNUAL_PRICE_ID", "BotBound Calls high annual price"],
  ["STRIPE_EMAIL_REGULAR_PRICE_ID", "BotBound Email regular monthly price"],
  ["STRIPE_EMAIL_REGULAR_ANNUAL_PRICE_ID", "BotBound Email regular annual price"],
  ["STRIPE_EMAIL_HIGH_PRICE_ID", "BotBound Email high monthly price"],
  ["STRIPE_EMAIL_HIGH_ANNUAL_PRICE_ID", "BotBound Email high annual price"],
  ["STRIPE_VOICE_EMAIL_REGULAR_PRICE_ID", "BotBound Calls + Email regular monthly price"],
  ["STRIPE_VOICE_EMAIL_REGULAR_ANNUAL_PRICE_ID", "BotBound Calls + Email regular annual price"],
  ["STRIPE_VOICE_EMAIL_HIGH_PRICE_ID", "BotBound Calls + Email high monthly price"],
  ["STRIPE_VOICE_EMAIL_HIGH_ANNUAL_PRICE_ID", "BotBound Calls + Email high annual price"],
  // Historical-only keys remain readable; they do not enable new channel checkout.
  ["STRIPE_STARTER_9_PRICE_ID", "BotBound Starter monthly price"],
  ["STRIPE_STARTER_9_ANNUAL_PRICE_ID", "BotBound Starter annual price"],
  ["STRIPE_STARTER_PRICE_ID", "BotBound Starter Plus monthly price"],
  ["STRIPE_STARTER_ANNUAL_PRICE_ID", "BotBound Starter Plus annual price"],
  ["STRIPE_TEAM_PRICE_ID", "BotBound Pro monthly price"],
  ["STRIPE_TEAM_ANNUAL_PRICE_ID", "BotBound Pro annual price"],
  ["STRIPE_BUSINESS_PRICE_ID", "BotBound Business monthly price"],
  ["STRIPE_BUSINESS_ANNUAL_PRICE_ID", "BotBound Business annual price"],
  ["STRIPE_EXTRA_AGENT_PRICE_ID", "Extra Agent + 50 Minutes recurring add-on"],
  ["STRIPE_LIVE_VIDEO_ADDON_PRICE_ID", "Retired Live Video SKU for leftover webhook matching"],
];

const optional = [
  [
    "PERPLEXITY_API_KEY",
    "Preferred live public-research vendor; grounded Gemini covers when unset",
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

const retiredVoiceEnvKeys = [
  "ELEVENLABS_API_KEY",
  "VITE_VAPI_PUBLIC_KEY",
  "VAPI_PRIVATE_KEY",
  "VAPI_WEBHOOK_SECRET",
  "VAPI_WEBHOOK_CREDENTIAL_ID",
  "XAI_API_KEY",
  "XAI_API_KEY_CHATKIT",
  "XAI_SIP_ALLOWED_ADDRESSES",
  "WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK",
];

const formatHints = new Map([
  ["APP_URL", "https://botbound.app (exactly; no path, port, credentials, or trailing slash)"],
  ["TWILIO_WEBHOOK_BASE_URL", "https://botbound.app (exactly)"],
  ["POSTGRES_URL", "postgresql://user:pass@host:port/db (host must be dotted, localhost, or IP)"],
  ["DATABASE_POOL_URL", "postgresql://user:pass@pooler-host:6543/db"],
  ["TWILIO_ACCOUNT_SID", "AC followed by 32 hexadecimal characters"],
  ["TWILIO_API_KEY", "SK followed by 32 hexadecimal characters"],
  ["FEDERAL_DNC_API_URL", "https://vendor.example/api/dnc-check"],
  ["AGENTMAIL_DEFAULT_DOMAIN", "botbound.app or a subdomain such as mail.botbound.app"],
]);

function configuredValue([key, _description, value]) {
  return value ?? process.env[key];
}

function isValidEnvValue(key, value) {
  if (!value) return true;
  if (key === "APP_URL" || key === "TWILIO_WEBHOOK_BASE_URL") {
    return String(value) === "https://botbound.app";
  }
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
  if (key === "VITE_STRIPE_PUBLIC_KEY") return /^pk_live_/.test(String(value).trim());
  if (key === "AGENTMAIL_DEFAULT_DOMAIN") {
    const domain = String(value).trim().toLowerCase().replace(/^@/, "");
    return domain === "botbound.app" || domain.endsWith(".botbound.app");
  }
  if (key === "WIRELINE_RECONCILE_STRIPE_PORTAL") {
    return String(value).trim().toLowerCase() === "true";
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
for (const key of retiredVoiceEnvKeys) {
  if (String(process.env[key] || "").trim()) {
    invalidRequired.push([
      key,
      "Retired voice-provider configuration must be removed; live calls use OpenAI Realtime over Twilio.",
    ]);
  }
}
const invalidRecommended = invalid(recommended);

const banner = (s) => `\n${"-".repeat(64)}\n  ${s}\n${"-".repeat(64)}`;

console.log(banner("BotBound - production env check"));

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
  missingRequired.forEach(([key, description]) =>
    console.log(`    - ${key}\n      ${description}`),
  );
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
  missingRecommended.forEach(([key, description]) =>
    console.log(`    - ${key}\n      ${description}`),
  );
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
