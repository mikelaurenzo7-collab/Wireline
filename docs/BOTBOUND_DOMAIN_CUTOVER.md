# BotBound domain cutover

BotBound is the customer-facing brand. `trywireline.com` remains the live production origin until the new domain is purchased and external provider consoles are updated.

## Source-of-truth boundary

- **Customer identity:** BotBound
- **Primary app origin:** `APP_URL` (server/OAuth/Stripe links)
- **Public crawler/social origin:** `VITE_PUBLIC_SITE_URL`
- **Legacy fallback while cutover is pending:** `https://trywireline.com`
- **Stable technical namespace:** `wireline` for persisted keys, database roles/migrations, route/event names, native bridges, and secrets unless explicitly migrated later.

## Cutover sequence

1. Buy the chosen BotBound domain and attach it to the Vercel `wireline` project without removing `trywireline.com`.
2. Set production `APP_URL=https://<botbound-domain>`.
3. Set production `VITE_PUBLIC_SITE_URL=https://<botbound-domain>`.
4. Redeploy. Build-time prerendering rewrites canonical, OG, Twitter, and JSON-LD origins from the legacy fallback to the configured BotBound origin.
5. Run `npm run oauth:redirects` against the production env and copy the exact callback URLs into every provider console.
6. Update Google, Microsoft, Slack, HubSpot, Salesforce, Shopify, Square, Meta, X, Yahoo, Zoom, Apollo, Google Sheets/Microsoft Graph, ChatGPT/MCP, and any other enabled provider allowlists/callbacks before treating OAuth failures as application regressions.
7. Update Supabase Auth site URL / redirect allowlist and any email-template links.
8. Update Stripe public business URL, support/privacy/terms URLs, customer-portal return URLs if externally configured, and dashboard branding only when the BotBound production cutover is intentional.
9. Update Resend verified sending domain and `RESEND_FROM_EMAIL` or `RESEND_FROM_DOMAIN`. Until then the sender display name is BotBound while the verified `trywireline.com` mailbox remains valid.
10. Keep `trywireline.com` attached and configure a permanent redirect to the BotBound origin only after OAuth, auth, billing, webhooks, email, and crawler metadata are verified on the new domain.

## Expected pre-cutover test behavior

OAuth provider tests that require the new provider-console callback allowlists may fail until step 6. That is an external configuration blocker, not permission to weaken state signing, session binding, same-origin checks, callback validation, or redirect contracts.

The repository must continue to prove that OAuth callback origins derive from `APP_URL`; no provider callback should hardcode a BotBound domain.
