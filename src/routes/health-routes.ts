/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { getHealthCapabilities, getIntegrationsStatus } from "../lib/integrations-registry";
import { evaluateLaunchReadiness } from "../lib/launch-readiness";
import { validateEnv } from "../lib/env-validator";
import { authenticateUser } from "../middleware/auth";
import { isPlatformAdmin, requirePlatformAdmin } from "../middleware/platform-admin";
import { getPlatformSloSnapshot } from "../lib/operator-slos";
import { evaluatePlatformOperationalSlos } from "../lib/platform-operational-slos";
import {
  OPENAI_STRUCTURED_PRIMARY_MODEL,
  STRUCTURED_PRIMARY_MODEL,
  GEMINI_STRUCTURED_FALLBACK_MODEL,
  VAPI_PREMIUM_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_VOICE_FALLBACK_MODEL,
} from "../lib/ai-models";
import { probeOpenAIModelDiagnostic } from "../lib/health-model-probe";
import type { AuthenticatedRequest } from "../types/auth";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { reportError } from "../lib/error-reporter";

const router = express.Router();
const healthRateLimiter = createIpRateLimiter({
  bucket: "api:health",
  windowMs: 60_000,
  max: 30,
  message: { error: "Too many health-check requests.", code: "RATE_LIMITED" },
});
const clientReportRateLimiter = createIpRateLimiter({
  bucket: "api:health:client-report",
  windowMs: 60_000,
  max: 20,
  message: { error: "Too many client error reports.", code: "RATE_LIMITED" },
});
function monitorTokenOk(req: Request): boolean {
  const expected = process.env.HEALTH_MONITOR_TOKEN || process.env.CRON_SECRET;
  const supplied =
    req.get("x-monitor-token") || (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function requireMonitorToken(req: Request, res: Response, next: NextFunction) {
  return monitorTokenOk(req)
    ? next()
    : res.status(401).json({ ok: false, code: "MONITOR_TOKEN_REQUIRED" });
}

router.post("/report", clientReportRateLimiter, (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (!message) {
    return res.status(400).json({ error: "Error message is required.", code: "INVALID_INPUT" });
  }

  const stack = typeof body.stack === "string" ? body.stack.slice(0, 4_000) : undefined;
  let route: string | undefined;
  if (typeof body.url === "string") {
    try {
      const parsed = new URL(body.url);
      route = `${parsed.pathname}${parsed.search}`.slice(0, 500);
    } catch {
      route = undefined;
    }
  }
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const contextKeys = Object.keys(context).slice(0, 20);
  const stackTop = stack?.split("\n").slice(0, 3).join("\n").slice(0, 800);
  const componentTop =
    typeof context.componentStack === "string"
      ? context.componentStack.split("\n").slice(0, 3).join("\n").slice(0, 800)
      : undefined;
  const errorClass =
    typeof context.errorClass === "string" ? context.errorClass.slice(0, 80) : "browser";
  const fingerprint = createHash("sha256")
    .update([errorClass, message, route || "unknown", stackTop || componentTop || ""].join("|"))
    .digest("hex")
    .slice(0, 16);

  log.error("Client error report", {
    fingerprint,
    errorClass,
    message,
    route,
    stackTop,
    componentTop,
    contextKeys,
  });
  reportError(new Error(message), {
    tags: { surface: "browser", route: route || "unknown", error_class: errorClass },
    fingerprint,
    browser_stack: stack,
    context_keys: contextKeys,
  });
  return res.status(202).json({ ok: true });
});
async function probeDatabase(
  timeoutMs = 1500,
): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const started = Date.now();
  try {
    await Promise.race([
      drizzle.select({ id: schema.settings.userId }).from(schema.settings).limit(1),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("db probe timed out")), timeoutMs),
      ),
    ]);
    return { ok: true, latency_ms: Date.now() - started };
  } catch (error) {
    return { ok: false, latency_ms: Date.now() - started, error: getErrorMessage(error) };
  }
}
router.get("/", healthRateLimiter, async (_req, res) => {
  const db = await probeDatabase();
  // Short edge cache coalesces monitoring bursts (multiple uptime monitors,
  // Vercel's own probes, and the app's internal checks) so a flood of health
  // requests does not translate into a flood of Postgres probes. 5s keeps
  // outage detection latency tight while cutting origin DB load under load.
  // stale-while-revalidate lets the edge serve a slightly stale 200 while a
  // fresh probe runs in the background, further reducing cold-origin hits.
  res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=15");
  res.status(db.ok ? 200 : 503).json({ ok: db.ok, timestamp: new Date().toISOString() });
});
router.get("/launch-readiness", healthRateLimiter, requireMonitorToken, (_req, res) => {
  const report = evaluateLaunchReadiness();
  res.status(report.campaign_ready ? 200 : 503).json({
    ok: report.campaign_ready,
    overall_score: report.overall_score,
    campaign_ready: report.campaign_ready,
    capabilities: report.capabilities.map((capability) => ({
      id: capability.id,
      level: capability.level,
      // Surface blockers when degraded/blocked so monitors/ops don't have to
      // reverse-engineer a bare level from source.
      ...(capability.blockers.length > 0 ? { blockers: capability.blockers } : {}),
    })),
    ...(report.launch_blockers.length > 0 ? { launch_blockers: report.launch_blockers } : {}),
    // Federal DNC and similar ops items stay visible without failing GO/score.
    ...(report.deferred_checklist.length > 0
      ? { deferred_checklist: report.deferred_checklist }
      : {}),
    timestamp: report.generated_at,
  });
});
router.get("/ready", healthRateLimiter, requireMonitorToken, async (_req, res) => {
  const env = validateEnv(),
    db = await probeDatabase(),
    launch = evaluateLaunchReadiness(),
    ok = env.valid && db.ok && launch.campaign_ready;
  res.status(ok ? 200 : 503).json({
    ok,
    env: { ok: env.valid, invalid: env.errors.length, by_group: env.byGroup },
    db: { ok: db.ok, latency_ms: db.latency_ms },
    launch: { ok: launch.campaign_ready, overall_score: launch.overall_score },
    timestamp: new Date().toISOString(),
  });
});
router.get(
  "/internal",
  healthRateLimiter,
  authenticateUser,
  async (_req: AuthenticatedRequest, res) => {
    const db = await probeDatabase();
    res.json({
      status: db.ok ? "ok" : "degraded",
      uptime_s: Math.round((process as any).uptime?.() || 0),
      db,
      capabilities: getHealthCapabilities(),
      app_model: STRUCTURED_PRIMARY_MODEL,
      voice_agent_model: VAPI_TENANT_DEFAULT_MODEL,
      voice_agent_premium_model: VAPI_PREMIUM_MODEL,
      llm_tiering: {
        voice_runtime: {
          provider: "openai",
          model: VAPI_TENANT_DEFAULT_MODEL,
          reason: "Managed low-latency Vapi model.",
        },
        voice_fallback: {
          provider: "google",
          model: VAPI_VOICE_FALLBACK_MODEL,
          reason: "Automatic failure fallback.",
        },
        reasoning_layer: {
          provider: "openai",
          model: STRUCTURED_PRIMARY_MODEL,
          reason:
            "Managed OpenAI Responses primary for training, QA, insights, and post-call work.",
        },
        reasoning_fallback: {
          provider: "google",
          model: GEMINI_STRUCTURED_FALLBACK_MODEL,
          reason: "First automatic fallback; the AI Gateway follows.",
        },
      },
      timestamp: new Date().toISOString(),
    });
  },
);
router.get("/actions", healthRateLimiter, authenticateUser, requirePlatformAdmin, (_req, res) =>
  res.json({ integrations: getIntegrationsStatus(), timestamp: new Date().toISOString() }),
);
router.get(
  "/integrations",
  healthRateLimiter,
  authenticateUser,
  requirePlatformAdmin,
  (_req, res) =>
    res.json({ integrations: getIntegrationsStatus(), timestamp: new Date().toISOString() }),
);
router.get(
  "/slos",
  healthRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    if (monitorTokenOk(req)) return next();
    return authenticateUser(req, res, next);
  },
  async (req: AuthenticatedRequest, res: Response) => {
    const windowHours = Math.min(
      168,
      Math.max(1, Number.parseInt(String(req.query.window_hours ?? "24"), 10) || 24),
    );
    const evaluated_at = new Date().toISOString();

    if (monitorTokenOk(req)) {
      const db = await probeDatabase();
      const platformSnapshot = await getPlatformSloSnapshot(drizzle, windowHours);
      const platform = evaluatePlatformOperationalSlos({
        dbOk: db.ok,
        dbLatencyMs: db.latency_ms,
        pendingJobs: platformSnapshot.jobs.queue.pending,
        webhookSuccessRate: platformSnapshot.webhooks.success_rate,
        webhookAttempts: platformSnapshot.webhooks.attempts_in_window,
        windowHours,
      });
      const dimensionValues = Object.values(platformSnapshot.dimensions);
      const banner_status = dimensionValues.includes("critical")
        ? "critical"
        : dimensionValues.includes("warn")
          ? "degraded"
          : "healthy";
      return res.json({
        ...platformSnapshot,
        ...platform,
        banner_status,
        timestamp: evaluated_at,
      });
    }

    const authed = req as AuthenticatedRequest;
    if (!authed.user?.id) {
      return res.status(401).json({ ok: false, code: "MONITOR_TOKEN_REQUIRED" });
    }
    let allowed = false;
    try {
      allowed = await isPlatformAdmin(authed.user);
    } catch {
      return res.status(500).json({ error: "Authorization check failed", code: "INTERNAL_ERROR" });
    }
    if (!allowed) {
      return res.status(403).json({ error: "Platform admin access required", code: "FORBIDDEN" });
    }

    const snapshot = await getPlatformSloSnapshot(drizzle, windowHours);
    const dimensionValues = Object.values(snapshot.dimensions);
    const banner_status = dimensionValues.includes("critical")
      ? "critical"
      : dimensionValues.includes("warn")
        ? "degraded"
        : "healthy";
    return res.json({
      ...snapshot,
      banner_status,
      status:
        banner_status === "critical"
          ? "degraded"
          : banner_status === "degraded"
            ? "degraded"
            : "ok",
      targets: {
        availability: {
          configured: true,
          status: snapshot.dimensions.jobs_queue === "critical" ? "degraded" : "ok",
          evidence: { jobs_queue: snapshot.dimensions.jobs_queue },
        },
        incident_response: {
          configured: !!(process.env.HEALTH_MONITOR_TOKEN || process.env.CRON_SECRET),
          status:
            process.env.HEALTH_MONITOR_TOKEN || process.env.CRON_SECRET
              ? "ok"
              : "insufficient_data",
        },
      },
      timestamp: evaluated_at,
    });
  },
);
router.get("/models", healthRateLimiter, authenticateUser, async (_req, res) => {
  const started = Date.now();
  const [voice, premium, reasoning] = await Promise.all([
    probeOpenAIModelDiagnostic(VAPI_TENANT_DEFAULT_MODEL),
    VAPI_PREMIUM_MODEL === VAPI_TENANT_DEFAULT_MODEL
      ? Promise.resolve(null)
      : probeOpenAIModelDiagnostic(VAPI_PREMIUM_MODEL),
    probeOpenAIModelDiagnostic(OPENAI_STRUCTURED_PRIMARY_MODEL),
  ]);
  const ok = voice.ok && reasoning.ok && (premium?.ok ?? true);
  res.status(ok ? 200 : 503).json({
    ok,
    total_latency_ms: Date.now() - started,
    probes: {
      voice_runtime: voice,
      ...(premium ? { voice_premium: premium } : {}),
      reasoning,
      reasoning_fallback: {
        ok: !!process.env.GEMINI_API_KEY,
        latency_ms: 0,
        model: GEMINI_STRUCTURED_FALLBACK_MODEL,
        ...(process.env.GEMINI_API_KEY ? {} : { error: "GEMINI_API_KEY not configured" }),
      },
    },
  });
});
export default router;
