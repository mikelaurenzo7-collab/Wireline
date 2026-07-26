/**
 * Voice observability API routes
 *
 *   POST /api/voice/metrics        — Record per-call telemetry (from webhooks)
 *   GET  /api/health/voice-status  — Public demo line health probe
 *   GET  /api/insights/latency     — Tenant latency trends (auth)
 */
import express, { Request, Response } from "express";
import { AppError } from "../lib/api-error";
import { z } from "zod";
import { vapiWebhookSecretOk } from "../lib/vapi-webhook-auth";
import { drizzle, log, tenantStore, requirePermission } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { insightsRateLimit, createIpRateLimiter } from "../middleware/api-rate-limits";
import { validateQuery } from "../lib/api-validation";
import {
  recordVoiceMetrics,
  computeVoiceHealthWindow,
  alertOnVoiceDegradation,
  getLatencyTrends,
} from "../lib/voice-observability";
import { getVoiceReliabilityPayload } from "../lib/voice-reliability";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

// POST /api/voice/metrics — called by Vapi webhooks (or similar) on call end
const VoiceReliabilityQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

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

router.post("/api/voice/metrics", async (req: Request, res: Response) => {
  try {
    if (!vapiWebhookSecretOk(req)) {
      log.warn("Rejected /api/voice/metrics with bad or missing Vapi secret");
      throw AppError.fromHttpStatus(401, "Unauthorized");
    }

    const parsed = MetricsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest("Invalid metrics payload", {
        details: parsed.error.flatten(),
      });
    }

    // Resolve userId from vapiCallId (required for multi-tenant isolation)
    const [row] = await drizzle
      .select({ userId: schema.callLogs.userId })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.vapiCallId, parsed.data.vapiCallId))
      .limit(1);

    if (!row?.userId) {
      throw AppError.fromHttpStatus(404, "Call not found");
    }

    await tenantStore.run(row.userId, async () => {
      await recordVoiceMetrics(row.userId, parsed.data);
    });
    res.json({ recorded: true });
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("POST /api/voice/metrics failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw AppError.fromHttpStatus(500, "Failed to record metrics");
  }
});

// Public, unauthenticated probe: throttle by IP so it can't be hammered into a
// repeated call-metrics aggregation + degradation-alert side-effect. Matches the
// public plan-table limiter posture; fails open if the limiter backend is down.
const voiceStatusPublicRateLimit = createIpRateLimiter({
  bucket: "api:health:voice-status",
  windowMs: 60_000,
  max: 60,
});

// GET /api/health/voice-status — public probe for demo line health
router.get(
  "/api/health/voice-status",
  voiceStatusPublicRateLimit,
  async (_req: Request, res: Response) => {
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
        abnormal_hangup_rate: window.abnormalHangupRate,
        tool_call_failure_rate: window.toolCallFailureRate,
        webhook_failure_rate: window.webhookFailureRate,
        escalation_failure_rate: window.escalationFailureRate,
        checked_at: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/health/voice-status failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail open — don't break deploys because of observability glitches
      res.status(200).json({ status: "unknown", probe: "failed" });
    }
  },
);

// GET /api/insights/voice-reliability — consolidated voice operating metrics (auth)
router.get(
  "/api/insights/voice-reliability",
  authenticateUser,
  requirePermission("insights.read"),
  insightsRateLimit,
  validateQuery(VoiceReliabilityQuerySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const days = (req.query as { days?: number }).days ?? 30;
      const payload = await getVoiceReliabilityPayload({
        userId: req.user.id,
        days,
      });
      res.json(payload);
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /insights/voice-reliability failed", {
        userId: req.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppError.fromHttpStatus(500, "Failed to load voice reliability metrics");
    }
  },
);

// GET /api/insights/latency — tenant latency trends (auth)
router.get(
  "/api/insights/latency",
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
      if (err instanceof AppError) throw err;
      log.error("GET /insights/latency failed", {
        userId: req.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppError.fromHttpStatus(500, "Failed to load latency trends");
    }
  },
);

// GET /api/insights/latency/recent — last N calls with metrics (for detail drill-down)
router.get(
  "/api/insights/latency/recent",
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
      if (err instanceof AppError) throw err;
      log.error("GET /insights/latency/recent failed", {
        userId: req.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw AppError.fromHttpStatus(500, "Failed to load recent calls");
    }
  },
);

export default router;
