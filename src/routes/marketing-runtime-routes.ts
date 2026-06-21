import { Router } from "express";
import { sql, gte } from "drizzle-orm";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

router.get("/api/public/stats", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.ip || "unknown").trim();
  const decision = await rateLimit(ip, { bucket: "public_stats", windowMs: 60_000, max: 30 });
  if (!decision.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(decision.resetMs / 1000)));
    throw AppError.fromHttpStatus(429, "Rate limit exceeded.");
  }
  try {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [agents, calls, tenants] = await Promise.all([
      drizzle.select({ count: sql<number>`count(*)::int` }).from(schema.agents).then((rows) => rows[0]?.count ?? 0),
      drizzle.select({ count: sql<number>`count(*)::int` }).from(schema.callLogs).where(gte(schema.callLogs.createdAt, startOfMonth)).then((rows) => rows[0]?.count ?? 0),
      drizzle.select({ count: sql<number>`count(*)::int` }).from(schema.users).then((rows) => rows[0]?.count ?? 0),
    ]);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=1200");
    res.json({ agents_online: agents, calls_this_month: calls, tenants, as_of: new Date().toISOString() });
  } catch (error) {
    log.warn("/api/public/stats failed", { error: error instanceof Error ? error.message : String(error) });
    res.json({ agents_online: 0, calls_this_month: 0, tenants: 0, as_of: new Date().toISOString() });
  }
});

export default router;
