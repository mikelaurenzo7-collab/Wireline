// src/routes/openapi-routes.ts
//
// Serves Wireline's OpenAPI 3.1 spec at GET /api/openapi.json.
//
// The spec is published unauthenticated because it is shape information,
// not data — every endpoint enforces its own auth. The response is
// cached for a short window so external SDK generators / agent
// frameworks don't hammer the server.

import express from "express";
import { getOpenApiSpec } from "../lib/openapi-spec";

const router = express.Router();

// Mirror the per-IP throttle used by health-routes so the spec endpoint
// cannot be turned into a cheap reflection amplifier.
const specRateLimit = new Map<string, number[]>();
const SPEC_RATE_WINDOW_MS = 60_000;
const SPEC_RATE_MAX = 60;
// Purge stale entries every 10 minutes to prevent unbounded Map growth
// in long-running (Docker) deployments. Skip when the Map is small.
setInterval(
  () => {
    if (specRateLimit.size < 100) return;
    const now = Date.now();
    for (const [key, hits] of specRateLimit) {
      if (hits.every((t) => now - t >= SPEC_RATE_WINDOW_MS)) {
        specRateLimit.delete(key);
      }
    }
  },
  10 * 60 * 1000,
).unref();

function specRateLimiter(req: any, res: any, next: any) {
  const xff = req.headers["x-forwarded-for"];
  const key = (typeof xff === "string" ? xff.split(",")[0].trim() : null) || req.ip || "anon";
  const now = Date.now();
  const hits = (specRateLimit.get(key) || []).filter((t: number) => now - t < SPEC_RATE_WINDOW_MS);
  if (hits.length >= SPEC_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many spec requests." });
  }
  hits.push(now);
  specRateLimit.set(key, hits);
  next();
}

// Resolve the public-facing server URL from APP_URL (production) or the
// inbound request's own host header (preview / dev). Same precedence the
// rest of the app uses for OAuth redirects.
function resolveServerUrl(req: express.Request): string | undefined {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host;
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) || (req.secure ? "https" : "http");
  if (!host) return undefined;
  return `${proto}://${host}`;
}

router.get("/openapi.json", specRateLimiter, (req, res) => {
  const spec = getOpenApiSpec(resolveServerUrl(req));
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json(spec);
});

export default router;
