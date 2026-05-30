/**
 * Voice observability API routes
 *
 *   POST /api/voice/metrics        — Record per-call telemetry (from webhooks)
 *   GET  /api/health/voice-status  — Public demo line health probe
 *   GET  /api/insights/latency     — Tenant latency trends (auth)
 */
import express, { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { insightsRateLimit } from "../middleware/api-rate-limits";
import {
  recordVoiceMetrics,
  computeVoiceHealthWindow,
  alertOnVoiceDegradation,
  getLatencyTrends,
} from "../lib/voice-observability";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

/**
 * Verify the Vapi webhook secret on the public telemetry endpoint.
 *
 * Without this, anyone who knows or guesses a `vapiCallId` could POST forged
 * latency/error metrics that get attributed to that tenant — polluting their
 * dashboards and potentially tripping the voice-degradation alerter. We use
 * the same X-Vapi-Secret the escalation + main Vapi webhooks check, with a
 * timing-safe compare. When VAPI_WEBHOOK_SECRET is unset (local dev), we allow
 * passthrough — matching the convention in escalation-routes.ts so test and
 * dev environments aren't forced to configure the secret.
 */
function vapiSecretOk(req: Request): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET || "";
  if (!expected) return true; // dev / unconfigured — allow (matches escalation convention)
  const provided =
    (req.headers["x-vapi-secret"] as string | undefined) ||
    (req.headers["x-vapi-signature"] as string | undefined) ||
    "";
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

// POST /api/voice/metrics — called by Vapi webhooks (or similar) on call end
const MetricsBodySchema = z.object({
  vapiCallId: z.string().min(1),
  ttftMs: z.number().int().min(0).optional(),
  ttfAudioMs: z.number().int().min(0).optional(),
  sttError: z.boolean().optional(),
  ttsError: z.boolean().optional(),
  pipelineError: z.enum(["stt", "tts", "llm", "connection", "unknown"]).optional(),
  latencyP50Ms: z.number().int().min(0).optional(),
  latencyP95Ms: z.number().int().min(0).optional(),
});

router.post("/voice/metrics", async (req: Request, res: Response) => {
  try {
    if (!vapiSecretOk(req)) {
      log.warn("Rejected /voice/metrics with bad or missing Vapi secret");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = MetricsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid metrics payload", details: parsed.error.flatten() });
    }

    // Resolve userId from vapiCallId (required for multi-tenant isolation)
    const [row] = await drizzle
      .select({ userId: schema.callLogs.userId })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.vapiCallId, parsed.data.vapiCallId))
      .limit(1);

    if (!row?.userId) {
      return res.status(404).json({ error: "Call not found" });
    }

    await recordVoiceMetrics(row.userId, parsed.data);
    res.json({ recorded: true });
  } catch (err) {
    log.error("POST /voice/metrics failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to record metrics" });
  }
});

// GET /api/health/voice-status — public probe for demo line health
router.get("/health/voice-status", async (_req: Request, res: Response) => {
  try {
    const window = await computeVoiceHealthWindow({ demoOnly: true, windowMinutes: 5 });
    const status = window.healthy ? "healthy" : "degraded";
    const httpStatus = window.healthy ? 200 : 503;

    // Trigger alert side-effect if degraded (non-blocking)
    if (!window.healthy) {
      void alertOnVoiceDegradation({ window, channel: "demo-line" });
    }

    res.status(httpStatus).json({
      status,
      demo_line: true,
      window_minutes: window.windowMinutes,
      total_calls: window.totalCalls,
      ttft_p95_ms: window.ttftP95Ms,
      stt_error_rate: window.sttErrorRate,
      tts_error_rate: window.ttsErrorRate,
      pipeline_error_rate: window.pipelineErrorRate,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    log.error("GET /health/voice-status failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail open — don't break deploys because of observability glitches
    res.status(200).json({ status: "unknown", error: "probe_failed" });
  }
});

// GET /api/insights/latency — tenant latency trends (auth)
router.get(
  "/insights/latency",
  authenticateUser,
  insightsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = Math.min(parseInt((req.query.days as string) || "30"), 90);
      const trends = await getLatencyTrends({ userId: req.user.id, days });
      res.json({
        days,
        trends,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      log.error("GET /insights/latency failed", {
        userId: req.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "Failed to load latency trends" });
    }
  },
);

// GET /api/insights/latency/recent — last N calls with metrics (for detail drill-down)
router.get(
  "/insights/latency/recent",
  authenticateUser,
  insightsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
      const rows = await drizzle
        .select({
          id: schema.callLogs.id,
          vapiCallId: schema.callLogs.vapiCallId,
          createdAt: schema.callLogs.createdAt,
          durationSeconds: schema.callLogs.durationSeconds,
          ttftMs: schema.callLogs.ttftMs,
          ttfAudioMs: schema.callLogs.ttfAudioMs,
          sttError: schema.callLogs.sttError,
          ttsError: schema.callLogs.ttsError,
          pipelineError: schema.callLogs.pipelineError,
          sentiment: schema.callLogs.sentiment,
          outcomeTag: schema.callLogs.outcomeTag,
        })
        .from(schema.callLogs)
        .where(eq(schema.callLogs.userId, req.user.id))
        .orderBy(desc(schema.callLogs.createdAt))
        .limit(limit);

      res.json({ calls: rows });
    } catch (err) {
      log.error("GET /insights/latency/recent failed", {
        userId: req.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "Failed to load recent calls" });
    }
  },
);

export default router;
