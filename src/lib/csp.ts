import { randomBytes } from "node:crypto";

// Hashes for the inline <script> blocks in index.html: theme bootstrap,
// Plausible stub, prod-gated Meta Pixel, and the JSON-LD structured data.
// (Stale hashes for superseded JSON-LD copy were removed so the allowlist
// stays minimal.)
export const INLINE_SCRIPT_HASHES = [
  "'sha256-3Z3f8c52musA1bws65NjZG2DaDDUbBisRU8i4FLei1w='",
  "'sha256-rikP6O8OvZlYRMZkxJ9ZM9m/LxculWr4DxAXvwZAF7c='",
  "'sha256-DVH1TrP34UqNunth7OtSpEQeORp9fBY4cJ1c8J3vaN8='",
  "'sha256-HRu6lpIht0GMfPA9V16W3+XLb2AmzF5D8q+AufQyOk4='",
] as const;

/**
 * Static style block injected by the marketing analytics scripts (stable
 * hash observed across viewports and runs). Allowlisting the exact hash
 * keeps style-src-elem strict while silencing the recurring CSP violation.
 */
export const INLINE_STYLE_HASHES = [
  "'sha256-kS5q06SqzKw4+AgkwljKbDIdqmQe8JBaaTtJoNArRJw='",
  // Playwright axe gate — disables transitions/animations before scanning.
  "'sha256-pjBMouHaxzAZFuesw6ZdkjqrWeDPx0aK6XjL/EpYcbk='",
] as const;

export const MARKETING_SCRIPT_SRCS = [
  "https://plausible.io",
  "https://connect.facebook.net",
  "https://www.googletagmanager.com",
  "https://*.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
] as const;

export function buildConnectSrcs(isDev: boolean = false): string {
  const base = [
    "'self'",
    "https://api.openai.com",
    "https://api.x.ai",
    "wss://api.x.ai",
    "https://api.vapi.ai",
    "wss://api.vapi.ai",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
    "https://www.googleapis.com",
    "https://login.microsoftonline.com",
    "https://graph.microsoft.com",
    "https://api.stripe.com",
    "https://plausible.io",
    "https://connect.facebook.net",
    "https://www.facebook.com",
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://stats.g.doubleclick.net",
  ];
  if (isDev) base.push("ws://localhost:*", "http://localhost:*", "ws://127.0.0.1:*");
  return base.join(" ");
}

export function buildCSP(isDev: boolean, nonce?: string, connectSrcs = "'self'"): string {
  const inlineHashes = INLINE_SCRIPT_HASHES.join(" ");
  const marketingSrcs = MARKETING_SCRIPT_SRCS.join(" ");
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io"
    : nonce
      ? `'self' 'nonce-${nonce}' ${inlineHashes} ${marketingSrcs}`
      : `'self' ${inlineHashes} ${marketingSrcs}`;
  const styleSrcElem = isDev
    ? "'self' 'unsafe-inline' https://fonts.googleapis.com"
    : `'self' ${INLINE_STYLE_HASHES.join(" ")} https://fonts.googleapis.com`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src-elem ${styleSrcElem}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${connectSrcs}`,
    "media-src 'self' blob: https://api.elevenlabs.io https://cdn.elevenlabs.io",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function generateCspNonce(): string {
  const nonce = randomBytes(16).toString("base64url");
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) throw new Error("generateCspNonce: unexpected character");
  return nonce;
}
