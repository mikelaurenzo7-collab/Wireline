#!/usr/bin/env node
/**
 * Wireline Vercel environment health audit.
 *
 * Reads environment-variable metadata only. Secret values are never printed.
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
  "POSTGRES_URL",
  "DATABASE_POOL_URL",
  "INTERNAL_JWT_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

const gateway = ["AI_GATEWAY_API_KEY", "WIRELINE_GATEWAY_STRUCTURED_MODEL"];

const recommended = [
  "OAUTH_STATE_SECRET",
  "APP_URL",
  "CORS_ORIGINS",
  "WIRELINE_DATA_KEY",
  "CRON_SECRET",
  "SENTRY_DSN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

// Voice is independently fail-closed. All platform-funded Vapi paths are now
// server-only; a browser publishable key is neither required nor desired.
const voice = [
  "VAPI_PRIVATE_KEY",
  "VAPI_WEBHOOK_SECRET",
  "LIVEAVATAR_API_KEY",
  "HEYGEN_API_KEY",
  "LIVEAVATAR_DEFAULT_AVATAR_ID",
];

const retired = ["VITE_VAPI_PUBLIC_KEY"];
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
    console.log("\nRETIRED BROWSER CREDENTIALS");
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

  console.log("\nWIRELINE · VERCEL ENVIRONMENT HEALTH");
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
    console.log("  ROTATION REQUIRED — remove retired browser credentials before production release.");
    process.exitCode = 2;
  } else {
    console.log("  CORE READY — no required platform variable is missing or retired browser key remains.");
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
