/**
 * CORS configuration helper. Lives in its own module so it can be tested
 * without pulling in the rest of the server (which transitively imports
 * Vite and is therefore tied to the dev-server runtime).
 */
import type { CorsOptions } from "cors";

/**
 * Build a CORS options object from a list of allowed origins.
 *
 * - Empty allowlist → returns `null`. Callers should skip mounting CORS
 *   middleware in this case so the server is same-origin only — the safe
 *   default for an SPA served from the same host.
 * - `"*"` wildcard is honored, but `credentials` is forced to `false`
 *   because browsers refuse credentialed XHRs against a wildcard origin.
 */
export function buildCorsOptions(allowed: readonly string[]): CorsOptions | null {
  if (allowed.length === 0) return null;
  const allowAny = allowed.includes("*");
  const exact = new Set(allowed.filter((o) => o !== "*"));

  return {
    origin(origin, callback) {
      // Same-origin / non-browser requests have no Origin header.
      if (!origin) return callback(null, true);
      if (allowAny) return callback(null, true);
      if (exact.has(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: !allowAny,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  };
}
