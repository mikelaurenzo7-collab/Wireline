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
const raw = process.env.APP_URL || process.argv[2] || "http://localhost:3000";
let url;
try {
  url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
} catch {
  console.error(
    "Invalid URL. Pass a full origin, e.g. http://localhost:3000 or https://app.example.com",
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
  ["Google Sheets", "/api/oauth/google-sheets/callback"],
  ["Microsoft", "/api/oauth/microsoft/callback"],
  ["Yahoo", "/api/oauth/yahoo/callback"],
  ["Salesforce", "/api/oauth/salesforce/callback"],
  ["HubSpot", "/api/oauth/hubspot/callback"],
  ["Apollo", "/api/oauth/apollo/callback"],
  ["Meta", "/api/oauth/meta/callback"],
  ["Shopify", "/api/oauth/shopify/callback"],
  ["Square", "/api/oauth/square/callback"],
  ["Microsoft Graph", "/api/oauth/microsoft-graph/callback"],
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
══════════════════════════════════════════════════════════════════

Set APP_URL="${origin}" in the target Vercel environment before validating OAuth.
The server derives redirect_uri from that canonical origin. Do not rename the
/api/auth/* or /api/oauth/* callback paths during the brand/domain cutover.
`);

printGroup("ACCOUNT SIGN-IN CALLBACKS", signInCallbacks);
printGroup("CONNECTED-INTEGRATION CALLBACKS", integrationCallbacks);

console.log(`
CUTOVER ORDER
  1. Add and verify the BotBound domain in Vercel.
  2. Set APP_URL to the canonical BotBound origin.
  3. Set VITE_PUBLIC_SITE_URL to the same public origin.
  4. Set CORS_ORIGINS to include the canonical origin and any deliberate transition origin.
  5. Add the applicable callback URLs above in each provider console before removing old-host callbacks.
  6. Redeploy the BotBound feature branch and complete sign-in + integration connect/disconnect smoke tests.
  7. Remove retired-host callback registrations only after the new origin is proven.

Provider credentials remain the existing environment variables. This script
prints callback contracts only and never reads or displays client secrets.
`);

if (isLocal) {
  console.log(`LOCAL NOTE
  Re-run this command with the purchased BotBound origin tomorrow. Providers
  that allow multiple callbacks can retain localhost and the legacy production
  origin during validation, then remove the retired host after cutover proof.
`);
}
