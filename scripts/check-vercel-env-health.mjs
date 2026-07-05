#!/usr/bin/env node
/**
 * Wireline Vercel environment health audit.
 *
 * Reads environment-variable metadata only. Secret values are never printed.
 *
 * Usage:
 *   VERCEL_TOKEN=... node scripts/check-vercel-env-health.mjs
 */

const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const TARGETS = ["production", "preview", "development"];
const token = process.env.VERCEL_TOKEN?.trim();

if (!token) {
  console.error("Set VERCEL_TOKEN before running this audit.");
  process.exit(1);
}

const required = [
  "POSTGRES_URL",
  "INTERNAL_JWT_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

const gateway = [
  "AI_GATEWAY_API_KEY",
  "WIRELINE_GATEWAY_STRUCTURED_MODEL",
];

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

// Voice remains an independent capability. Its absence is reported, never
// treated as a core platform or AI Gateway failure.
const voice = [
  "VAPI_PRIVATE_KEY",
  "VITE_VAPI_PUBLIC_KEY",
  "VAPI_WEBHOOK_SECRET",
  "ELEVENLABS_API_KEY",
  "LIVEAVATAR_API_KEY",
  "HEYGEN_API_KEY",
  "LIVEAVATAR_DEFAULT_AVATAR_ID",
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
      // A key may be stored as several per-target entries (Vercel creates
      // separate rows when you POST a single-target array) or as one entry
      // covering many targets. Coverage is correct as long as the UNION of
      // every entry's targets covers the required targets — not the per-entry
      // missing set, which unions false negatives when entries are split.
      const covered = new Set(entries.flatMap((entry) => (Array.isArray(entry.target) ? entry.target : [])));
      const missingTargets = TARGETS.filter((t) => t !== "development" && !covered.has(t));
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

  console.log("\nWIRELINE · VERCEL ENVIRONMENT HEALTH");
  console.log("Metadata only. No secret values were requested or printed.");

  const missingCore = report("CORE PLATFORM", required, true);
  const missingGateway = report("AI GATEWAY", gateway, false);
  const missingRecommended = report("RECOMMENDED OPERATIONS", recommended, false);
  const missingVoice = report("VOICE CAPABILITY · INDEPENDENT", voice, false);
  const missingBilling = report("BILLING ADD-ONS", billing, false);

  console.log("\nDECISION");
  if (missingCore) {
    console.log("  BLOCKED — configure the missing core variables across every deployment target.");
    process.exitCode = 2;
  } else {
    console.log("  CORE READY — no required platform variable is missing.");
  }
  console.log(
    "  AI Gateway: deployed Vercel functions can use VERCEL_OIDC_TOKEN; AI_GATEWAY_API_KEY remains recommended for local and non-Vercel execution.",
  );
  console.log(`  Informational gaps — gateway: ${missingGateway}, operations: ${missingRecommended}, voice: ${missingVoice}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
