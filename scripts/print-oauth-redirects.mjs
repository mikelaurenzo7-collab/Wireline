#!/usr/bin/env node
/**
 * Prints Wireline OAuth redirect URIs and env var names for a given public origin.
 * Usage:
 *   node scripts/print-oauth-redirects.mjs
 *   node scripts/print-oauth-redirects.mjs https://your-app.vercel.app
 *   set APP_URL=https://... && node scripts/print-oauth-redirects.mjs
 *
 * Set APP_URL to the same value you use in production (or Vercel) so tokens match
 * the redirect_uri used in code (see src/lib/oauth-helpers.ts, oauth-routes.ts).
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

const paths = {
  Google: "/api/oauth/google/callback",
  Microsoft: "/api/oauth/microsoft/callback",
  Salesforce: "/api/oauth/salesforce/callback",
  HubSpot: "/api/oauth/hubspot/callback",
  Slack: "/api/oauth/slack/callback",
  X: "/api/oauth/x/callback",
  Zoom: "/api/oauth/zoom/callback",
};

console.log(`
══════════════════════════════════════════════════════════════════
 Wireline — OAuth console setup (origin: ${origin})
══════════════════════════════════════════════════════════════════

1) .env (same origin as below)
   APP_URL="${origin}"
   (Required so the server builds the same redirect_uri as the provider console.)

2) Google Cloud Console — APIs & Services → Credentials → OAuth 2.0 Client (Web)
   https://console.cloud.google.com/apis/credentials
   • Authorized JavaScript origins (add each you use):
     - ${origin}
   • Authorized redirect URIs (must match exactly, including trailing path):
     - ${origin}${paths.Google}
   Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

3) Microsoft Entra — App registrations → your app → Authentication
   https://entra.microsoft.com/ (or Azure portal → Microsoft Entra ID)
   • Platform: Web
   • Redirect URI:
     - ${origin}${paths.Microsoft}
   • Enable "Access tokens" and "ID tokens" if prompted for SPA vs Web; use Web.
   Env: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
   (API permissions: delegated as required by your tenant for Mail + Calendar; see .env.example)

4) Salesforce — Connected App → Callback URL
   ${origin}${paths.Salesforce}
   Env: SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET

5) HubSpot — App → Redirect URL
   ${origin}${paths.HubSpot}
   Env: HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET

6) Slack — Your App → OAuth & Permissions → Redirect URLs
   https://api.slack.com/apps
   ${origin}${paths.Slack}
   Env: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
   (Bot scopes: chat:write, channels:read, groups:read, team:read — see src/lib/slack-service.ts)

7) X (Twitter) — Developer Portal → your app → User authentication settings
   https://developer.x.com/
   Callback / Redirect URI:
   ${origin}${paths.X}
   Env: X_CLIENT_ID, X_CLIENT_SECRET
   (OAuth 2.0 scopes: tweet.read tweet.write users.read offline.access — see src/lib/x-service.ts)

8) Zoom — App Marketplace → your OAuth app → Redirect URL for OAuth
   https://marketplace.zoom.us/
   ${origin}${paths.Zoom}
   Env: ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
`);
if (isLocal) {
  console.log(`
── Note: For production, re-run this script with your deployed APP_URL and add
   the same callback paths on that origin in every provider. You can register
   both localhost and production URLs in Google / Azure / Slack / Zoom.
`);
}
