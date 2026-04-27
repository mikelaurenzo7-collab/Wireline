<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2c926e67-8bf1-499b-be5e-023ddaa98008

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the required environment variables in `.env.local`:
   - `GEMINI_API_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `APP_URL`
   - `WIRELINE_WEBHOOK_SECRET` (shared secret for Vapi webhook verification; generate with `openssl rand -hex 32`)
   - `OAUTH_STATE_SECRET` (HMAC key for the OAuth state token; generate with `openssl rand -hex 32`)
   - `ALLOWED_ORIGINS` (optional, comma-separated CORS allowlist; leave empty for same-origin-only)
   - `WEBHOOK_TIMESTAMP_TOLERANCE_SEC` (optional, default `300`; replay window for the Vapi webhook HMAC signature)
3. Run the app:
   `npm run dev`

## Webhook signature verification

The `/api/vapi-webhook` endpoint accepts two authentication shapes (preferred first):

1. **HMAC signature** — `X-Vapi-Signature: sha256=<hex>` computed over
   `<X-Vapi-Timestamp>.<raw request body>` with `WIRELINE_WEBHOOK_SECRET`.
   The timestamp must be within `WEBHOOK_TIMESTAMP_TOLERANCE_SEC` of the
   server clock to prevent replay.
2. **Legacy shared secret** — `X-Vapi-Secret: <WIRELINE_WEBHOOK_SECRET>`
   (constant-time compared). Kept for backward compatibility.

Both schemes are rate-limited.
