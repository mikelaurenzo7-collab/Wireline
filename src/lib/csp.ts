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
 */
export function buildConnectSrcs(): string {
  return [
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
  ].join(" ");
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
export function buildCSP(
  isDev: boolean,
  nonce?: string,
  connectSrcs = "'self'",
): string {
  // In dev keep 'unsafe-inline' + 'unsafe-eval' for Vite HMR.
  // In prod, OAuth callback pages receive a per-request nonce so their one
  // inline postMessage script is allowed without 'unsafe-inline' being global.
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : nonce
      ? `'self' 'nonce-${nonce}'`
      : "'self'";

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${connectSrcs}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
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
