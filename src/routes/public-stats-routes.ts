/**
 * GET /api/public/stats — aggregated, no-PII counters for the
 * public AuthPortal trust band. Returns numbers like "X agents
 * online · Y calls handled this month." Reads as "this is real
 * and growing" even at low scale.
 *
 * No auth required (it's a public marketing endpoint). The
 * response intentionally omits any per-tenant or per-user data;
 * only COUNT() rollups. Cached at the CDN layer for 60s so the
 * trust band doesn't burn DB roundtrips on every visitor.
 */

import { Router, Request, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { sql, gte } from "drizzle-orm";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

router.get("/api/public/stats", async (req: Request, res: Response) => {
  // 30/min per IP. The endpoint is public + uncached on first hit;
  // someone hammering it could push DB load and run up Supabase
  // egress. Honest visitors hit it once on AuthPortal mount.
  const ip = (
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    req.ip ||
    "unknown"
  ).trim();
  const rl = await rateLimit(ip, { bucket: "public_stats", windowMs: 60_000, max: 30 });
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
    return res.status(429).json({ error: "Rate limit exceeded." });
  }
  try {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [agentsRow, callsRow, tenantsRow] = await Promise.all([
      drizzle
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.agents)
        .then((r) => r[0]?.count ?? 0),
      drizzle
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.callLogs)
        .where(gte(schema.callLogs.createdAt, startOfMonth))
        .then((r) => r[0]?.count ?? 0),
      drizzle
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.users)
        .then((r) => r[0]?.count ?? 0),
    ]);

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.json({
      agents_online: agentsRow,
      calls_this_month: callsRow,
      tenants: tenantsRow,
      as_of: new Date().toISOString(),
    });
  } catch (err: any) {
    log.warn("/api/public/stats failed", { error: err?.message });
    // Never break the trust band — return zeros + 200 instead of
    // a 500 so the public page renders cleanly even when DB
    // queries error.
    res.json({
      agents_online: 0,
      calls_this_month: 0,
      tenants: 0,
      as_of: new Date().toISOString(),
    });
  }
});

export default router;
