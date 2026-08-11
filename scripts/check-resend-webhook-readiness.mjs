#!/usr/bin/env node
/**
 * Resend feedback readiness is intentionally separate from RESEND_API_KEY.
 * Existing transactional email must keep working while the provider webhook is
 * provisioned, but operators need an unmissable signal that sender-reputation
 * feedback is not yet closed-loop.
 */

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "local";
const apiKey = process.env.RESEND_API_KEY?.trim();
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
const endpoint = "https://trywireline.com/api/webhooks/resend";

if (!apiKey) {
  console.log("Resend feedback readiness: sender transport is not configured (RESEND_API_KEY missing).");
  process.exit(0);
}

if (!webhookSecret) {
  console.warn(
    `Resend feedback readiness: ${environment} sender is configured but signed delivery feedback is NOT active. Create the production Resend webhook at ${endpoint} and set RESEND_WEBHOOK_SECRET.`,
  );
  process.exit(0);
}

if (!/^whsec_[A-Za-z0-9+/=_-]{16,}$/.test(webhookSecret)) {
  console.error(
    "Resend feedback readiness: RESEND_WEBHOOK_SECRET is present but does not look like a Resend whsec_ signing secret.",
  );
  process.exit(1);
}

console.log(`Resend feedback readiness: signed provider feedback configured for ${environment}.`);
