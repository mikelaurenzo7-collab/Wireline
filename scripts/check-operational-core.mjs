#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runLaunchBrowserAuditIfRequested } from "./run-launch-browser-audit.mjs";

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
  /configurePreviewEnvironment/,
  "Preview builds must derive their public origin only after credential isolation passes.",
);
requirePattern(
  "scripts/check-deployment-boundaries.mjs",
  /productionOnlyPreviewKeys/,
  "Preview builds must fail closed when production provider configuration is inherited.",
);
requirePattern(
  "scripts/check-deployment-boundaries.mjs",
  /credentialLikeName/,
  "New credential-like variables must default to blocked in preview.",
);
forbidPattern(
  "scripts/vercel-build.mjs",
  /sanitizePreviewEnvironment|WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW/,
  "Preview builds must fail on production credentials instead of masking them only during compilation.",
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
  "scripts/run-launch-browser-audit.mjs",
  /\[launch-browser-audit\]/,
  "The browser audit must require an explicit one-shot commit tag.",
);
requirePattern(
  "scripts/run-launch-browser-audit.mjs",
  /marketing-viewport-lock\.spec\.ts[\s\S]*marketing-a11y\.spec\.ts[\s\S]*public-demo-fallback\.spec\.ts/,
  "The browser audit must cover geometry, accessibility, and protected-demo fallback.",
);
requirePattern(
  "scripts/run-launch-browser-audit.mjs",
  /playwright[\s\S]*install[\s\S]*chromium/,
  "The browser audit must install the pinned Chromium build before execution.",
);

requirePattern(
  "drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql",
  /CREATE TRIGGER wireline_agents_managed_voice/,
  "Managed voice invariants must be enforced in the database.",
);
requirePattern(
  "drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql",
  /CREATE UNIQUE INDEX IF NOT EXISTS uq_cloned_voices_active_source/,
  "Concurrent clone requests must share one active source reservation.",
);
requirePattern(
  "drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql",
  /REVOKE ALL ON FUNCTION public\.wireline_normalize_managed_voice\(\) FROM PUBLIC/,
  "Internal trigger functions must not inherit PUBLIC execution privileges.",
);
requirePattern(
  "drizzle/migrations/0119_elevenlabs_managed_voice_runtime.sql",
  /REVOKE EXECUTE ON FUNCTION public\.wireline_normalize_managed_voice\(\) FROM anon, authenticated/,
  "Client roles must not directly execute the managed-runtime trigger function.",
);
requirePattern(
  "src/lib/managed-voice-runtime.ts",
  /provider:\s*"11labs" as const/,
  "Approved studio voices must use ElevenLabs through the managed phone runtime.",
);
requirePattern(
  "src/lib/managed-voice-runtime.ts",
  /fallbackPlan:[\s\S]*provider:\s*"vapi" as const/,
  "Every ElevenLabs phone voice must carry a different-provider Vapi fallback.",
);
requirePattern(
  "src/routes/voices-routes.ts",
  /requirePlatformAdmin[\s\S]*voiceMutationRateLimit[\s\S]*cloneIpRateLimit/,
  "Private voice creation must remain founder-only and rate-limited.",
);
requirePattern(
  "src/routes/voices-routes.ts",
  /status:\s*"creating"[\s\S]*voice\.clone\.consent_granted/,
  "Provider spend must follow a durable clone reservation and consent record.",
);
requirePattern(
  "src/routes/voices-routes.ts",
  /CREATING_RESERVATION_TTL_MS[\s\S]*rejectionReason:\s*"reservation_expired"/,
  "Timed-out clone reservations must recover before a new provider spend.",
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
runLaunchBrowserAuditIfRequested();
