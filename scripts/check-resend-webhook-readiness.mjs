#!/usr/bin/env node
/**
 * Resend feedback readiness is intentionally separate from RESEND_API_KEY.
 * Existing transactional email must keep working while the provider webhook is
 * provisioned, but operators need an unmissable signal that sender-reputation
 * feedback is not yet closed-loop.
 */

import { timingSafeEqual } from "node:crypto";

const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "local";
const apiKey = process.env.RESEND_API_KEY?.trim();
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();

const endpoint = "https://trywireline.com/api/webhooks/resend";
const requiredEvents = [
  "email.bounced",
  "email.complained",
  "email.suppressed",
  "email.failed",
  "email.delivery_delayed",
].sort();

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function exactEvents(value) {
  return (
    Array.isArray(value) &&
    value.length === requiredEvents.length &&
    [...value].sort().every((event, index) => event === requiredEvents[index])
  );
}

if (!apiKey) {
  if (environment === "production") {
    console.error("Resend feedback readiness: Production is missing RESEND_API_KEY.");
    process.exit(1);
  }
  console.log(
    "Resend feedback readiness: sender transport is not configured (RESEND_API_KEY missing).",
  );
  process.exit(0);
}

if (!webhookSecret) {
  if (environment === "production") {
    console.error("Resend feedback readiness: Production is missing RESEND_WEBHOOK_SECRET.");
    process.exit(1);
  }
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

if (environment === "production") {
  let listResponse;
  try {
    listResponse = await fetch("https://api.resend.com/webhooks?limit=100", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error(
      `Resend feedback readiness: live webhook audit failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  const listBody = await listResponse.json().catch(() => null);
  if (!listResponse.ok || listBody?.has_more === true || !Array.isArray(listBody?.data)) {
    console.error(
      `Resend feedback readiness: webhook inventory is unavailable or truncated (HTTP ${listResponse.status}).`,
    );
    process.exit(1);
  }
  const targets = listBody.data.filter((webhook) => webhook?.endpoint === endpoint);
  if (targets.length !== 1) {
    console.error(
      `Resend feedback readiness: expected exactly one production webhook target; found ${targets.length}.`,
    );
    process.exit(1);
  }

  const detailResponse = await fetch(
    `https://api.resend.com/webhooks/${encodeURIComponent(targets[0].id)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const detail = await detailResponse.json().catch(() => null);
  if (
    !detailResponse.ok ||
    detail?.status !== "enabled" ||
    detail?.endpoint !== endpoint ||
    !exactEvents(detail?.events) ||
    !sameSecret(detail?.signing_secret, webhookSecret)
  ) {
    console.error(
      "Resend feedback readiness: the live production endpoint, event set, status, or signing secret is not exact.",
    );
    process.exit(1);
  }
  console.log("Resend feedback readiness: live production webhook and signing secret verified.");
} else {
  console.log(`Resend feedback readiness: signed provider feedback configured for ${environment}.`);
}
