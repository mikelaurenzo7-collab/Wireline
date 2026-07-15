#!/usr/bin/env node

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const isProduction = environment === "production";
const isPreview = environment === "preview";
const failures = [];
const warnings = [];

const value = (name) => String(process.env[name] || "").trim();
const requireValue = (name, reason) => {
  if (!value(name)) failures.push(`${name}: ${reason}`);
};

function validHttpsUrl(name, required = false) {
  const raw = value(name);
  if (!raw) {
    if (required) failures.push(`${name}: required for ${environment} deployments`);
    return;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") failures.push(`${name}: must use https`);
  } catch {
    failures.push(`${name}: must be a valid absolute URL`);
  }
}

if (isProduction) {
  requireValue("POSTGRES_URL", "production API database connection is missing");
  requireValue("INTERNAL_JWT_SECRET", "production session signing is missing");
  requireValue("OAUTH_STATE_SECRET", "OAuth state signing is missing");
  requireValue("OPENAI_API_KEY", "the primary managed intelligence runtime is missing");
  requireValue("VAPI_PRIVATE_KEY", "the managed live-call runtime is missing");
  requireValue("VAPI_WEBHOOK_SECRET", "Vapi callbacks cannot be verified");
  requireValue("TWILIO_ACCOUNT_SID", "Twilio account binding is missing");
  requireValue("TWILIO_AUTH_TOKEN", "Twilio callbacks cannot be verified");
  requireValue("STRIPE_SECRET_KEY", "production billing is missing");
  requireValue("STRIPE_WEBHOOK_SECRET", "Stripe callbacks cannot be verified");
  requireValue("VITE_STRIPE_PUBLIC_KEY", "production checkout cannot initialize");
  validHttpsUrl("APP_URL", true);
  validHttpsUrl("TWILIO_WEBHOOK_BASE_URL", false);

  if (value("STRIPE_SECRET_KEY") && !value("STRIPE_SECRET_KEY").startsWith("sk_live_")) {
    failures.push("STRIPE_SECRET_KEY: production must use a live-mode key");
  }
  if (
    value("VITE_STRIPE_PUBLIC_KEY") &&
    !value("VITE_STRIPE_PUBLIC_KEY").startsWith("pk_live_")
  ) {
    failures.push("VITE_STRIPE_PUBLIC_KEY: production must use a live-mode key");
  }
}

if (isPreview && value("WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW") !== "true") {
  if (value("STRIPE_SECRET_KEY").startsWith("sk_live_")) {
    failures.push(
      "STRIPE_SECRET_KEY: live Stripe credentials are blocked in preview; use test mode or set the explicit emergency override",
    );
  }
  if (value("VITE_STRIPE_PUBLIC_KEY").startsWith("pk_live_")) {
    failures.push(
      "VITE_STRIPE_PUBLIC_KEY: live Stripe credentials are blocked in preview; use test mode or set the explicit emergency override",
    );
  }

  const appUrl = value("APP_URL");
  if (/^https:\/\/(www\.)?trywireline\.com\/?$/i.test(appUrl)) {
    failures.push("APP_URL: preview deployments must not identify themselves as the production origin");
  }

  if (value("WIRELINE_RUN_MIGRATIONS") === "true") {
    warnings.push("Preview migrations were explicitly forced; confirm the database is isolated before deploy.");
  }
}

if (warnings.length) {
  console.warn("Deployment-boundary warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length) {
  console.error(`Deployment-boundary check failed for ${environment}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Deployment-boundary check passed for ${environment}.`);
