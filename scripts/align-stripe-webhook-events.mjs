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
 *   VERCEL_TOKEN=... node scripts/align-stripe-webhook-events.mjs           # check
 *   VERCEL_TOKEN=... node scripts/align-stripe-webhook-events.mjs --apply   # fix
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { getVercelEnvValue } from "./lib/vercel-env-values.mjs";

const API_VERSION = "2026-02-25.clover";
const WEBHOOK_URL = "https://trywireline.com/api/stripe-webhook";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const apply = process.argv.includes("--apply");

function extractHandledEvents(source) {
  return [
    ...source.matchAll(/(?:case\s+|event(?:Type|\.type)\s*===\s*)"([a-z_]+(?:\.[a-z_]+)+)"/g),
  ].map((match) => match[1]);
}

// Source of truth: the switch arms in the canonical router plus exact event
// comparisons in the preflight mounted before it. Parsing both owners prevents
// an event implemented at the stricter boundary from being silently omitted
// from Stripe's endpoint subscription.
const billingRoutes = readFileSync(join(ROOT, "src/routes/billing-routes.ts"), "utf8");
const financialPreflight = readFileSync(
  join(ROOT, "src/middleware/stripe-runtime-allowance-retry.ts"),
  "utf8",
);
const handledEvents = [
  ...new Set([
    ...extractHandledEvents(billingRoutes),
    ...extractHandledEvents(financialPreflight),
  ]),
].sort();

if (!handledEvents.length) {
  console.error("Could not extract any handled Stripe webhook events.");
  process.exit(1);
}

const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error("Set VERCEL_TOKEN so the Stripe key can be read from Vercel.");
  process.exit(1);
}

const stripeKey = await getVercelEnvValue(token, "STRIPE_SECRET_KEY");
if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not found on Vercel project");

const stripe = new Stripe(stripeKey, { apiVersion: API_VERSION });
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const endpoint = endpoints.data.find((candidate) => candidate.url === WEBHOOK_URL);
if (!endpoint) {
  console.error(`No Stripe webhook endpoint found for ${WEBHOOK_URL}.`);
  process.exit(1);
}

const enabled = [...(endpoint.enabled_events || [])].sort();
const missing = handledEvents.filter((event) => !enabled.includes(event));
const extra = enabled.filter((event) => event !== "*" && !handledEvents.includes(event));

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
