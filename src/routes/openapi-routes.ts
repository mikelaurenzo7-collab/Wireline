// src/routes/openapi-routes.ts
//
// Serves Wireline's OpenAPI 3.1 spec at GET /api/openapi.json.

import express, { Request, Response } from "express";
import { normalizeOpenApiForManagedRuntime } from "../lib/openapi-managed-runtime";
import { getOpenApiSpec } from "../lib/openapi-spec";
import { createIpRateLimiter } from "../middleware/api-rate-limits";

const router = express.Router();

const specRateLimiter = createIpRateLimiter({
  bucket: "api:openapi",
  windowMs: 60_000,
  max: 60,
  message: { error: "Too many spec requests.", code: "RATE_LIMITED" },
});

function resolveServerUrl(req: Request): string | undefined {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

  // Express resolves req.protocol and req.ip through the single trusted proxy
  // hop configured in server.ts. Reading raw forwarding headers here would let
  // direct callers influence the generated server URL or rotate limiter keys.
  const host = req.get("host");
  if (!host) return undefined;
  return `${req.protocol}://${host}`;
}

router.get("/openapi.json", specRateLimiter, (req: Request, res: Response) => {
  const spec = normalizeOpenApiForManagedRuntime(getOpenApiSpec(resolveServerUrl(req)));
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json(spec);
});

export default router;
