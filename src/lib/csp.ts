/**
 * Content Security Policy utilities.
 *
 * Shared between server.ts (sets headers) and the test suite (assertions).
 * Keep logic here — never duplicate in individual route files.
 */
import { randomBytes } from "node:crypto";

/**
 * Build the CSP connect-src origins for the runtime.
 * fetch() is allowed to reach Anthropic, Vapi, Google, Microsoft Graph, and Stripe.
 *
 * In dev mode we also allow Vite's HMR transport (ws + http to any localhost
 * port) — Vite picks a random HMR port at boot, so the CSP can't pin a single
 * one. Production never reaches this branch.
 */
export function buildConnectSrcs(isDev: boolean = false): string {
  const base = [
    "'self'",
    "https://api.anthropic.com",
    "https://api.vapi.ai",
    "wss://api.vapi.ai",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
    "https://www.googleapis.com",
    "https://login.microsoftonline.com",
    "https://graph.microsoft.com",
    "https://api.stripe.com",
    // Plausible analytics beacons — the script loaded from plausible.io
    // (see index.html) POSTs pageview/event data back to this origin.
    // Without it every page logs a blocked-request CSP error.
    "https://plausible.io",
  ];
  if (isDev) {
    // Vite HMR opens a WebSocket on a port it picks at startup. Allow the
    // dev origin (and ws://) so the dev shell doesn't spam CSP warnings.
    base.push("ws://localhost:*", "http://localhost:*", "ws://127.0.0.1:*");
  }
  return base.join(" ");
}

/**
 * Build a complete CSP header string.
 *
 * @param isDev    - When true (Vite dev mode), include `'unsafe-inline'` and
 *                   `'unsafe-eval'` on `script-src` for HMR. Never pass true
 *                   in production.
 * @param nonce    - Optional per-request URL-safe base64 nonce. When supplied
 *                   in prod mode, `script-src` becomes `'self' 'nonce-{nonce}'`
 *                   instead of just `'self'`. Callers must also add
 *                   `nonce="${nonce}"` to every inline `<script>` tag.
 * @param connectSrcs - Pre-built connect-src string. Defaults to a minimal
 *                      self-only value if not provided (useful in tests).
 */
export function buildCSP(isDev: boolean, nonce?: string, connectSrcs = "'self'"): string {
  // In dev keep 'unsafe-inline' + 'unsafe-eval' for Vite HMR.
  // In prod, OAuth callback pages receive a per-request nonce so their one
  // inline postMessage script is allowed without 'unsafe-inline' being global.
  // plausible.io is allowlisted in both modes so the analytics script in
  // index.html loads instead of being blocked with a CSP console error.
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io"
    : nonce
      ? `'self' 'nonce-${nonce}' https://plausible.io`
      : "'self' https://plausible.io";

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Allow Google Fonts stylesheet. We pull `Instrument Serif`, `Geist`, and
    // `JetBrains Mono` via `@import url('https://fonts.googleapis.com/...')`
    // in `src/index.css`; without this entry the entire Google Fonts request
    // is blocked at every page load.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    // fonts.gstatic.com serves the actual .woff2 files referenced by the
    // Google Fonts CSS above. Without this entry the fonts fail to download
    // and the UI silently falls back to a system serif.
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src ${connectSrcs}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    // Director Stitch live HTML previews load artifact HTML via blob: iframes.
    `frame-src 'self' blob:`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");
}

/**
 * Generate a cryptographically random URL-safe base64 nonce for CSP script
 * tags. Uses base64url encoding (RFC 4648 §5) so the nonce contains only
 * A-Z, a-z, 0-9, `-`, and `_` — safe for HTML attributes and HTTP headers
 * without additional escaping.
 */
export function generateCspNonce(): string {
  const nonce = randomBytes(16).toString("base64url");
  // Defensive: base64url output must only contain URL-safe characters.
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) {
    throw new Error("generateCspNonce: unexpected character in nonce — this is a bug");
  }
  return nonce;
}
