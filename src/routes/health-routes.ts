import express from "express";
import { db } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as claudeBrain from "../lib/claude-brain";
import { getHealthCapabilities, getIntegrationsStatus } from "../lib/integrations-registry";
import { authenticateUser } from "../middleware/auth";

const router = express.Router();

async function probeDatabase(timeoutMs = 1500): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const probe = db.from("wireline_settings").select("user_id", { head: true, count: "exact" }).limit(1);
    const result = await Promise.race([
      probe,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error("db probe timed out")), timeoutMs)),
    ]) as { error?: { message: string } | null };
    if (result?.error) return { ok: false, latency_ms: Date.now() - t0, error: result.error.message };
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err: any) {
    return { ok: false, latency_ms: Date.now() - t0, error: getErrorMessage(err) };
  }
}

const healthRateLimit = new Map<string, number[]>();
const HEALTH_RATE_WINDOW_MS = 60_000;
const HEALTH_RATE_MAX = 30;

function healthRateLimiter(req: any, res: any, next: any) {
  const xff = req.headers["x-forwarded-for"];
  const key = (typeof xff === "string" ? xff.split(",")[0].trim() : null) || req.ip || "anon";
  const now = Date.now();
  const hits = (healthRateLimit.get(key) || []).filter((t: number) => now - t < HEALTH_RATE_WINDOW_MS);
  if (hits.length >= HEALTH_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many health-check requests." });
  }
  hits.push(now);
  healthRateLimit.set(key, hits);
  next();
}

router.get("/", healthRateLimiter, async (_req, res) => {
  const dbStatus = await probeDatabase();
  const status = dbStatus.ok ? "ok" : "degraded";
  res.status(dbStatus.ok ? 200 : 503).json({
    status,
    uptime_s: Math.round(process.uptime()),
    db: dbStatus,
    // Capability flags are derived from the canonical integrations registry
    // (src/lib/integrations-registry.ts). Keys here are stable — external
    // monitors may depend on them.
    capabilities: getHealthCapabilities(),
    claude_model: claudeBrain.CLAUDE_MODEL_DEFAULT,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Authenticated, structured integrations report. Used by the AdminSettings
 * Platform Health panel. Returns one row per registered integration with
 * status, required-ness, env-var presence map, and fallback notes.
 */
router.get("/integrations", healthRateLimiter, authenticateUser, (_req, res) => {
  res.json({
    integrations: getIntegrationsStatus(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
