#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

function requirePattern(path, pattern, message) {
  const source = read(path);
  if (!pattern.test(source)) failures.push(`${path}: ${message}`);
}

function forbidPattern(path, pattern, message) {
  const source = read(path);
  if (pattern.test(source)) failures.push(`${path}: ${message}`);
}

requirePattern(
  "src/lib/twilio-webhook-auth.ts",
  /Twilio\.validateRequest/,
  "Twilio callbacks must use the official SDK validator.",
);
requirePattern(
  "src/lib/twilio-webhook-auth.ts",
  /TWILIO_WEBHOOK_BASE_URL/,
  "Twilio signature validation must support an explicit canonical callback origin.",
);
requirePattern(
  "src/lib/twilio-webhook-auth.ts",
  /TWILIO_ACCOUNT_SID/,
  "Twilio callbacks must reject a mismatched configured account SID.",
);
requirePattern(
  "src/routes/twilio-webhook.ts",
  /evaluateTwilioWebhookAuth/,
  "Messaging callbacks must verify Twilio signatures.",
);
requirePattern(
  "src/routes/twilio-webhook-base.ts",
  /evaluateTwilioWebhookAuth/,
  "Voice fallback callbacks must verify Twilio signatures.",
);

requirePattern(
  "src/lib/body-parsers.ts",
  /RAW_WEBHOOK_LIMIT/,
  "Raw provider webhook payloads must have a shared request-size ceiling.",
);
requirePattern(
  "src/lib/body-parsers.ts",
  /TWILIO_WEBHOOK_LIMIT/,
  "Twilio form payloads must have a request-size ceiling.",
);
requirePattern(
  "src/lib/body-parsers.ts",
  /parameterLimit:\s*128/,
  "Twilio form parsing must cap parameter count.",
);

requirePattern(
  "src/routes/billing-routes.ts",
  /stripe\.webhooks\.constructEvent/,
  "Stripe events must be signature verified from the raw body.",
);
requirePattern(
  "src/routes/billing-routes.ts",
  /insert\(schema\.stripeEvents\)/,
  "Stripe events must claim a durable idempotency key before processing.",
);
requirePattern(
  "src/routes/billing-routes.ts",
  /duplicate event ignored/,
  "Stripe duplicate deliveries must acknowledge without reprocessing.",
);
requirePattern(
  "src/routes/billing-routes.ts",
  /delete\(schema\.stripeEvents\)/,
  "Failed Stripe processing must release the claim so Stripe can retry.",
);
requirePattern(
  "src/lib/stripe-helpers.ts",
  /stripeBlockedInPreview/,
  "Preview runtimes must refuse inherited live Stripe credentials.",
);
requirePattern(
  "src/lib/stripe-helpers.ts",
  /delete process\.env\.STRIPE_WEBHOOK_SECRET/,
  "Preview runtimes must disable live Stripe webhook processing.",
);

requirePattern(
  "scripts/vercel-build.mjs",
  /environment === "production"/,
  "Database migrations must default to production deployments only.",
);
requirePattern(
  "scripts/vercel-build.mjs",
  /WIRELINE_RUN_MIGRATIONS/,
  "Migration execution must have an explicit environment override.",
);
requirePattern(
  "scripts/vercel-build.mjs",
  /isDuplicateV0Project/,
  "Duplicate Vercel projects must never migrate the production database by default.",
);
requirePattern(
  "scripts/vercel-build.mjs",
  /check-deployment-boundaries\.mjs/,
  "Vercel builds must enforce preview and production credential isolation before migrations.",
);
requirePattern(
  "scripts/vercel-build.mjs",
  /sanitizePreviewEnvironment/,
  "Vercel preview builds must neutralize inherited production credentials before compilation.",
);
requirePattern(
  "scripts/check-deployment-boundaries.mjs",
  /WIRELINE_PREVIEW_DATABASE_ISOLATED/,
  "Forced preview migrations must require an explicitly isolated database.",
);
requirePattern(
  "src/lib/app-url.ts",
  /VERCEL_ENV !== "preview"/,
  "Preview links and redirects must resolve against the preview deployment.",
);
requirePattern(
  "src/lib/app-url.ts",
  /VERCEL_URL/,
  "Preview origin resolution must use Vercel's deployment hostname.",
);

requirePattern(
  "drizzle/migrations/0100_managed_vapi_runtime.sql",
  /CREATE TRIGGER wireline_agents_managed_voice/,
  "Managed voice invariants must be enforced in the database.",
);
requirePattern(
  "drizzle/migrations/0101_operational_core_function_privileges.sql",
  /REVOKE ALL ON FUNCTION public\.wireline_normalize_managed_voice\(\) FROM PUBLIC/,
  "Internal trigger functions must not inherit PUBLIC execution privileges.",
);
requirePattern(
  "drizzle/migrations/0101_operational_core_function_privileges.sql",
  /REVOKE EXECUTE ON FUNCTION public\.wireline_normalize_managed_voice\(\) FROM anon, authenticated/,
  "Client roles must not directly execute the managed-runtime trigger function.",
);
requirePattern(
  "src/lib/vapi-assistant-factory-v2.ts",
  /provider:\s*"vapi" as const/,
  "The active phone runtime must remain on the managed Vapi provider.",
);
requirePattern(
  "src/lib/csp.ts",
  /api\.x\.ai/,
  "Optional xAI experiment hosts remain allowlisted in the browser CSP boundary.",
);
forbidPattern(
  "src/lib/csp.ts",
  /api\.elevenlabs\.io|cdn\.elevenlabs\.io/,
  "ElevenLabs is server-side only and must not regain browser network access.",
);

if (failures.length) {
  console.error("Operational-core contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Operational-core contract passed.");
