#!/usr/bin/env node
/**
 * Keep the production Stripe webhook endpoint's enabled_events aligned with
 * every event handled by the canonical billing router or its exact-path
 * financial-integrity preflight.
 *
 * Default mode is read-only: it reports drift and exits 1 so it can gate a
 * release. Pass --apply to update the endpoint in place (URL and signing
 * secret are untouched; only enabled_events changes).
 *
 * Usage:
 * Supply STRIPE_SECRET_KEY through the secure operator environment, then run:
 *   node scripts/align-stripe-webhook-events.mjs           # check
 *   node scripts/align-stripe-webhook-events.mjs --apply   # fix
 * VERCEL_TOKEN remains an optional lookup fallback for the legacy deployment.
 */

import Stripe from "stripe";
import { resolveStripeOperatorKey } from "./lib/stripe-operator-key.mjs";
import { getHandledStripeWebhookEvents } from "./lib/stripe-handled-events.mjs";
import {
  evaluateStripeWebhookReadiness,
  getPinnedStripeApiVersion,
} from "./lib/stripe-webhook-readiness.mjs";
import { CANONICAL_PRODUCTION_URL } from "./lib/production-url.mjs";

const API_VERSION = getPinnedStripeApiVersion();
const WEBHOOK_URL = `${CANONICAL_PRODUCTION_URL}/api/stripe-webhook`;

const apply = process.argv.includes("--apply");

// Source of truth: the switch arms in the canonical router plus exact event
// comparisons in the preflight mounted before it, read by the shared helper so
// the launch-status gate cannot disagree with this script about the same
// endpoint.
const handledEvents = getHandledStripeWebhookEvents();

if (!handledEvents.length) {
  console.error("Could not extract any handled Stripe webhook events.");
  process.exit(1);
}

const stripeKey = await resolveStripeOperatorKey();

const stripe = new Stripe(stripeKey, { apiVersion: API_VERSION });
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const readiness = evaluateStripeWebhookReadiness(
  { ok: true, body: endpoints },
  handledEvents,
  API_VERSION,
);
if (readiness.identityFindings.length) {
  console.error(`Stripe webhook identity is blocked: ${readiness.identityFindings.join(", ")}.`);
  console.error(
    `Require one enabled live endpoint for ${WEBHOOK_URL}, pinned to ${API_VERSION}, and a complete inventory. An API-version change requires a replacement endpoint and signing-secret rotation before disabling the old endpoint; event alignment cannot repair it.`,
  );
  process.exit(1);
}
const endpoint = readiness.endpoint;
const missing = readiness.missingEvents;
const extra = readiness.extraEvents;

console.log(`Endpoint: ${endpoint.id} (${endpoint.status})`);
console.log(`Handled by server: ${handledEvents.join(", ")}`);

if (!missing.length && !extra.length) {
  console.log("OK: enabled_events already match the server's handled events.");
  process.exit(0);
}

if (missing.length)
  console.log(`Missing from endpoint (events would be dropped): ${missing.join(", ")}`);
if (extra.length) console.log(`Enabled but unhandled (delivery noise): ${extra.join(", ")}`);

if (!apply) {
  console.log("\nRun with --apply to set enabled_events to exactly the handled set.");
  process.exit(1);
}

const updated = await stripe.webhookEndpoints.update(endpoint.id, {
  enabled_events: handledEvents,
});
console.log(`Updated ${updated.id}; enabled_events now: ${updated.enabled_events.join(", ")}`);
