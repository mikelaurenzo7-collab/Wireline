import express, { Request, Response, NextFunction } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { getHealthCapabilities, getIntegrationsStatus } from "../lib/integrations-registry";
import { authenticateUser } from "../middleware/auth";
import { getOperatorSloSnapshot } from "../lib/operator-slos";
import {
  CLAUDE_MODEL_DEFAULT,
  VAPI_PREMIUM_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
} from "../lib/claude-brain";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

async function probeDatabase(
  timeoutMs = 1500,
): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const probe = drizzle.select({ id: schema.settings.userId }).from(schema.settings).limit(1);

    await Promise.race([
      probe,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("db probe timed out")), timeoutMs),
      ),
    ]);
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err: any) {
    return { ok: false, latency_ms: Date.now() - t0, error: getErrorMessage(err) };
  }
}

const healthRateLimit = new Map<string, number[]>();
const HEALTH_RATE_WINDOW_MS = 60_000;
const HEALTH_RATE_MAX = 30;
// Purge stale IP entries every 10 minutes to prevent unbounded Map growth
// in long-running (Docker) deployments. Skip when the Map is small to avoid
// unnecessary iteration overhead.
setInterval(
  () => {
    if (healthRateLimit.size < 100) return;
    const now = Date.now();
    for (const [key, hits] of healthRateLimit) {
      if (hits.every((t) => now - t >= HEALTH_RATE_WINDOW_MS)) {
        healthRateLimit.delete(key);
      }
    }
  },
  10 * 60 * 1000,
).unref();

function healthRateLimiter(req: Request, res: Response, next: NextFunction) {
  const xff = req.headers["x-forwarded-for"];
  const key = (typeof xff === "string" ? xff.split(",")[0].trim() : null) || req.ip || "anon";
  const now = Date.now();
  const hits = (healthRateLimit.get(key) || []).filter(
    (t: number) => now - t < HEALTH_RATE_WINDOW_MS,
  );
  if (hits.length >= HEALTH_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many health-check requests." });
  }
  hits.push(now);
  healthRateLimit.set(key, hits);
  next();
}

/**
 * Public health probe — INTENTIONALLY MINIMAL. Returns enough for load
 * balancers + uptime monitors to know we're alive, but no information
 * disclosure (no capability matrix, no model names, no vendor names, no
 * db latency, no uptime). Full detail moved to /api/health/internal,
 * which is authenticated.
 *
 * A "too talkative" health endpoint is a free reconnaissance gift to
 * attackers and reads as amateur on a security-conscious prospect's
 * first probe.
 */
router.get("/", healthRateLimiter, async (_req, res) => {
  const dbStatus = await probeDatabase();
  res.status(dbStatus.ok ? 200 : 503).json({
    ok: dbStatus.ok,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Temporary Migration Route
 */
import { sql } from "drizzle-orm";
router.get("/migrate-temp", async (_req, res) => {
  try {
    await drizzle.execute(sql`ALTER TABLE "wireline_agents" ADD COLUMN IF NOT EXISTS "flow_config" jsonb;`);
    res.status(200).json({ ok: true, message: "Migration complete" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Authenticated detail probe — same data the old public probe returned,
 * now gated behind a valid JWT. Used by the in-app SystemPanel + the
 * monitoring stack (which signs in as a service account).
 */
router.get("/internal", healthRateLimiter, authenticateUser, async (_req, res) => {
  const dbStatus = await probeDatabase();
  const status = dbStatus.ok ? "ok" : "degraded";
  res.status(200).json({
    status,
    uptime_s: Math.round(process.uptime()),
    db: dbStatus,
    capabilities: getHealthCapabilities(),
    // Distinct identifiers per runtime so operators + monitoring can
    // see exactly which model each layer is on. The in-app reasoning
    // brain (post-call digest, recipes, QA) leads the voice-agent
    // brain (constrained to whatever Vapi's allowlist accepts), and
    // the 10 showcase agents on the landing page run a higher tier
    // than the tenant default.
    app_model: CLAUDE_MODEL_DEFAULT,
    voice_agent_model: VAPI_TENANT_DEFAULT_MODEL,
    voice_agent_premium_model: VAPI_PREMIUM_MODEL,
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

/** Authenticated SLO snapshot for the signed-in tenant (Admin → System). */
router.get(
  "/slos",
  healthRateLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const n = Number(req.query.window_hours);
      const hours = Number.isFinite(n) ? Math.min(Math.max(n, 1), 168) : 24;
      const snapshot = await getOperatorSloSnapshot(drizzle, req.user.id, hours);

      const dimValues = Object.values(snapshot.dimensions) as string[];
      const banner_status = dimValues.includes("critical")
        ? "critical"
        : dimValues.includes("warn")
          ? "warn"
          : "ok";

      res.json({
        ...snapshot,
        banner_status,
        subscribable_events: ["slo.jobs.critical", "slo.webhooks.degraded", "slo.enrichment.dead"],
      });
    } catch (err: any) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  },
);

export default router;
