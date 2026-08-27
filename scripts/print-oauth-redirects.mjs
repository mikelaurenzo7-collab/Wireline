#!/usr/bin/env node
/**
 * Prints the exact BotBound OAuth redirect inventory for a public origin.
 *
 * Usage:
 *   node scripts/print-oauth-redirects.mjs
 *   node scripts/print-oauth-redirects.mjs https://your-preview.vercel.app
 *   APP_URL=https://your-production-origin.example node scripts/print-oauth-redirects.mjs
 *
 * The BotBound brand migration intentionally does not rename callback paths.
 * Provider registrations change hostname when APP_URL changes; stable path
 * contracts stay compatible with existing sessions, routes, and integration code.
 */
const CANONICAL_ORIGIN = "https://botbound.me";
const LEGACY_ORIGIN = "https://trywireline.com";
const raw = process.env.APP_URL || process.argv[2] || CANONICAL_ORIGIN;
let url;
try {
  url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
} catch {
  console.error(
    "Invalid URL. Pass a full origin, e.g. http://localhost:3000 or https://botbound.me",
  );
  process.exit(1);
}

const origin = url.origin.replace(/\/$/, "");
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.host);

const signInCallbacks = [
  ["Google sign-in", "/api/auth/google/callback"],
  ["Microsoft sign-in", "/api/auth/microsoft/callback"],
  ["Yahoo sign-in", "/api/auth/yahoo/callback"],
];

const integrationCallbacks = [
  ["Google", "/api/oauth/google/callback"],
  ["Google Sheets", "/api/oauth/google_sheets/callback"],
  ["Microsoft", "/api/oauth/microsoft/callback"],
  ["Salesforce", "/api/oauth/salesforce/callback"],
  ["HubSpot", "/api/oauth/hubspot/callback"],
  ["Apollo", "/api/oauth/apollo/callback"],
  ["Meta", "/api/oauth/meta/callback"],
  ["Shopify", "/api/oauth/shopify/callback"],
  // Square's dashboard registration predates the generic OAuth router naming.
  ["Square", "/api/ecommerce/oauth/callback"],
  ["Microsoft Teams", "/api/oauth/microsoft_teams/callback"],
  ["Microsoft Excel", "/api/oauth/microsoft_excel/callback"],
  ["Slack", "/api/oauth/slack/callback"],
  ["X", "/api/oauth/x/callback"],
  ["Zoom", "/api/oauth/zoom/callback"],
];

function printGroup(title, callbacks) {
  console.log(`\n${title}`);
  for (const [label, path] of callbacks) {
    console.log(`  ${label.padEnd(20)} ${origin}${path}`);
  }
}

console.log(`
══════════════════════════════════════════════════════════════════
 BotBound OAuth cutover inventory
 Origin: ${origin}
 Canonical: ${CANONICAL_ORIGIN}
 Legacy transition origin: ${LEGACY_ORIGIN}
══════════════════════════════════════════════════════════════════

Set APP_URL="${origin}" in the target Vercel environment before validating OAuth.
The server derives redirect_uri from that canonical origin. Do not rename the
existing /api/auth/* or provider callback paths during the brand/domain cutover.
`);

printGroup("ACCOUNT SIGN-IN CALLBACKS", signInCallbacks);
printGroup("CONNECTED-INTEGRATION CALLBACKS", integrationCallbacks);
console.log(
  "\nDEFERRED: Yahoo Mail connection is not registered until XOAUTH2 read/send execution ships. Yahoo sign-in remains active.\n",
);

console.log(`
CUTOVER ORDER
  1. Add and verify botbound.me in the existing Vercel project.
  2. Add every applicable botbound.me callback in provider consoles while retaining trywireline.com callbacks.
  3. Set APP_URL=${CANONICAL_ORIGIN} in the target production environment.
  4. Set CORS_ORIGINS to include ${CANONICAL_ORIGIN} and ${LEGACY_ORIGIN} during the transition.
  5. Redeploy and complete sign-in + integration connect/disconnect smoke tests on botbound.me.
  6. Update external webhooks, email sender domains, public app URLs, privacy/terms URLs, and crawler properties.
  7. Keep trywireline.com live until all old-host callbacks/webhooks have zero required traffic.
  8. Only then redirect the retired public host and remove retired provider callback registrations.

Provider credentials remain the existing environment variables. This script
prints callback contracts only and never reads or displays client secrets.
`);

if (isLocal) {
  console.log(`LOCAL NOTE
  Providers that allow multiple callbacks can retain localhost and the legacy
  production origin during validation, then remove the retired host only after
  botbound.me cutover proof.
`);
}
