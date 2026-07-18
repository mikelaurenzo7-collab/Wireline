// src/routes/openapi-routes.ts
//
// Serves Wireline's OpenAPI 3.1 spec at GET /api/openapi.json.

import express, { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/api-error";
import { normalizeOpenApiForManagedRuntime } from "../lib/openapi-managed-runtime";
import { getOpenApiSpec } from "../lib/openapi-spec";

const router = express.Router();

const specRateLimit = new Map<string, number[]>();
const SPEC_RATE_WINDOW_MS = 60_000;
const SPEC_RATE_MAX = 60;
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

function specRateLimiter(req: Request, res: Response, next: NextFunction) {
  const xff = req.headers["x-forwarded-for"];
  const key = (typeof xff === "string" ? xff.split(",")[0].trim() : null) || req.ip || "anon";
  const now = Date.now();
  const hits = (specRateLimit.get(key) || []).filter((t: number) => now - t < SPEC_RATE_WINDOW_MS);
  if (hits.length >= SPEC_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    throw AppError.fromHttpStatus(429, "Too many spec requests.");
  }
  hits.push(now);
  specRateLimit.set(key, hits);
  next();
}

function resolveServerUrl(req: Request): string | undefined {
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

router.get("/openapi.json", specRateLimiter, (req: Request, res: Response) => {
  const spec = normalizeOpenApiForManagedRuntime(getOpenApiSpec(resolveServerUrl(req)));
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json(spec);
});

export default router;
