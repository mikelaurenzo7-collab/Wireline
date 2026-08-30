#!/usr/bin/env node
/**
 * BotBound Vercel environment health audit.
 *
 * Reads environment-variable metadata only. Secret values are never printed.
 * Production is the only target this report may require; preview credential
 * isolation is enforced separately inside every build by
 * scripts/check-deployment-boundaries.mjs.
 *
 * Usage:
 *   VERCEL_TOKEN=... node scripts/check-vercel-env-health.mjs
 */
import { TEAM_ID, PROJECT_ID } from "./lib/vercel-project.mjs";

const token = process.env.VERCEL_TOKEN?.trim();

if (!token) {
  console.error("Set VERCEL_TOKEN before running this audit.");
  process.exit(1);
}

const required = [
  "APP_URL",
  "POSTGRES_URL",
  "DATABASE_POOL_URL",
  "INTERNAL_JWT_SECRET",
  "OAUTH_STATE_SECRET",
  "OAUTH_BRIDGE_SECRET",
  "MCP_OAUTH_TOKEN_PEPPER",
  "WIRELINE_DATA_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_PROJECT_ID",
  "OPENAI_WEBHOOK_SECRET",
  "ELEVENLABS_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_WEBHOOK_BASE_URL",
  "PLATFORM_SMS_FROM",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "VITE_STRIPE_PUBLIC_KEY",
  "RESEND_API_KEY",
  "AGENTMAIL_API_KEY",
  "AGENTMAIL_DEFAULT_DOMAIN",
  "CRON_SECRET",
  "WIRELINE_RECONCILE_STRIPE_PORTAL",
];

const gateway = ["AI_GATEWAY_API_KEY", "WIRELINE_GATEWAY_STRUCTURED_MODEL"];

const recommended = [
  "CORS_ORIGINS",
  "SENTRY_DSN",
];

// Voice is independently fail-closed at request time. The SIP project and
// signed webhook belong in core production coverage; these pins are optional
// because the runtime already defaults to gpt-realtime-2.1 / gpt-4o-mini-transcribe.
const voice = [
  "OPENAI_REALTIME_MODEL",
  "OPENAI_REALTIME_TRANSCRIBER",
];

const retired = [
  "VITE_VAPI_PUBLIC_KEY",
  "VAPI_PRIVATE_KEY",
  "VAPI_WEBHOOK_SECRET",
  "VAPI_WEBHOOK_CREDENTIAL_ID",
  "XAI_API_KEY",
  "XAI_API_KEY_CHATKIT",
  "XAI_SIP_ALLOWED_ADDRESSES",
  "WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK",
];
const billing = ["STRIPE_LIVE_VIDEO_ADDON_PRICE_ID", "STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID"];

async function main() {
  const response = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await response.text();
  if (!response.ok) throw new Error(`Vercel API ${response.status}: ${body.slice(0, 500)}`);

  const { envs = [] } = JSON.parse(body);
  const byKey = new Map();
  for (const env of envs) {
    const entries = byKey.get(env.key) || [];
    entries.push(env);
    byKey.set(env.key, entries);
  }

  const report = (label, keys, strict = false) => {
    console.log(`\n${label}`);
    let missing = 0;
    for (const key of keys) {
      const entries = byKey.get(key) || [];
      if (!entries.length) {
        missing++;
        console.log(`  ${strict ? "✗" : "○"} ${key} — not configured`);
        continue;
      }
      // Production is the only required target: preview builds reject
      // credential-like project configuration at the deployment boundary.
      const covered = new Set(
        entries.flatMap((entry) => (Array.isArray(entry.target) ? entry.target : [])),
      );
      const missingTargets = ["production"].filter((t) => !covered.has(t));
      const types = [...new Set(entries.map((entry) => entry.type || "plain"))].join(", ");
      console.log(
        `  ${missingTargets.length ? "△" : "✓"} ${key} — ${types}${
          missingTargets.length ? `; missing: ${missingTargets.join(", ")}` : ""
        }`,
      );
      if (strict && missingTargets.length) missing++;
    }
    return missing;
  };

  const reportRetired = (keys) => {
    console.log("\nRETIRED PROVIDER CREDENTIALS");
    let configured = 0;
    for (const key of keys) {
      const entries = byKey.get(key) || [];
      if (entries.length) {
        configured++;
        const targets = [
          ...new Set(entries.flatMap((entry) => (Array.isArray(entry.target) ? entry.target : []))),
        ];
        console.log(`  ✗ ${key} — remove from ${targets.join(", ") || "all targets"}`);
      } else {
        console.log(`  ✓ ${key} — absent`);
      }
    }
    return configured;
  };

  console.log("\nBOTBOUND · VERCEL ENVIRONMENT HEALTH");
  console.log("Metadata only. No secret values were requested or printed.");

  const missingCore = report("CORE PLATFORM", required, true);
  const missingGateway = report("AI GATEWAY", gateway, false);
  const missingRecommended = report("RECOMMENDED OPERATIONS", recommended, false);
  const missingVoice = report("VOICE CAPABILITY · SERVER ONLY", voice, false);
  const configuredRetired = reportRetired(retired);
  const missingBilling = report("BILLING ADD-ONS", billing, false);

  console.log("\nDECISION");
  if (missingCore) {
    console.log("  BLOCKED — configure the missing core variables for the production target.");
    process.exitCode = 2;
  } else if (configuredRetired) {
    console.log(
      "  ROTATION REQUIRED — remove retired Vapi/xAI credentials before production release.",
    );
    process.exitCode = 2;
  } else {
    console.log(
      "  METADATA COMPLETE — all required production keys are targeted correctly and no retired provider key remains.",
    );
    console.log(
      "  Secret values, canonical URL equality, provider account state, and end-to-end canaries still require the fail-closed production build and launch checks.",
    );
  }
  console.log(
    "  AI Gateway: deployed Vercel functions can use VERCEL_OIDC_TOKEN; AI_GATEWAY_API_KEY remains recommended for local and non-Vercel execution.",
  );
  console.log(
    `  Informational gaps — gateway: ${missingGateway}, operations: ${missingRecommended}, voice: ${missingVoice}, billing add-ons: ${missingBilling}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
