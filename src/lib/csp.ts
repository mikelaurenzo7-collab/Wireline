import { randomBytes } from "node:crypto";

// Hashes for the inline <script> blocks in index.html: theme bootstrap,
// Plausible stub, and JSON-LD structured data. Advertising measurement lives in
// a same-origin external loader so it can remain off until explicit consent.
export const INLINE_SCRIPT_HASHES = [
  // Theme-init boot script.
  "'sha256-3Z3f8c52musA1bws65NjZG2DaDDUbBisRU8i4FLei1w='",
  // Plausible analytics stub.
  "'sha256-rikP6O8OvZlYRMZkxJ9ZM9m/LxculWr4DxAXvwZAF7c='",
  // schema.org JSON-LD structured-data block (non-executable).
  "'sha256-2CeqyV3zA6ZMpVmB4HrPXKhAe1s1SccoYditH6KMhJE='",
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
] as const;

export function buildConnectSrcs(isDev: boolean = false): string {
  const base = [
    "'self'",
    // Optional xAI hosts retained for experimental surfaces and curated
    // server-proxied previews; customer demos and the managed runtime use OpenAI.
    "https://api.x.ai",
    "wss://api.x.ai",
    // OpenAI Realtime: Studio + ChatGPT private voice mint ephemeral secrets
    // server-side; the browser posts the WebRTC SDP offer to api.openai.com.
    "https://api.openai.com",
    "https://api.vapi.ai",
    "wss://api.vapi.ai",
    // Live video (LiveAvatar / LiveKit): browser SDK signals + media.
    "https://api.liveavatar.com",
    "https://*.livekit.cloud",
    "wss://*.livekit.cloud",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
    "https://www.googleapis.com",
    "https://login.microsoftonline.com",
    "https://graph.microsoft.com",
    "https://api.stripe.com",
    "https://plausible.io",
    "https://connect.facebook.net",
    "https://www.facebook.com",
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
  // Typefaces are served first-party from /fonts.css + /fonts/*.woff2, so
  // neither Google font host needs to be allowlisted any more.
  const styleSrcElem = isDev ? "'self' 'unsafe-inline'" : `'self' ${INLINE_STYLE_HASHES.join(" ")}`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src-elem ${styleSrcElem}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrcs}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "frame-ancestors 'none'",
    // Plugin/embed vectors are unused by this SPA — deny them explicitly
    // rather than leaning on default-src, so an injected <object>/<embed>
    // has no fallback source list to exploit.
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function generateCspNonce(): string {
  const nonce = randomBytes(16).toString("base64url");
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) throw new Error("generateCspNonce: unexpected character");
  return nonce;
}
