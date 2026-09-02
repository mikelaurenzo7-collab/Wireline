/**
 * Voice observability API routes
 *
 *   GET  /api/insights/voice-reliability — Tenant voice reliability (auth)
 *   GET  /api/insights/latency     — Tenant latency trends (auth)
 */
import express, { Response } from "express";
import { AppError } from "../lib/api-error";
import { z } from "zod";
import { drizzle, log, requirePermission } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { insightsRateLimit } from "../middleware/api-rate-limits";
import { validateQuery } from "../lib/api-validation";
import { getLatencyTrends } from "../lib/voice-observability";
import { getVoiceReliabilityPayload } from "../lib/voice-reliability";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

const VoiceReliabilityQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

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
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
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
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const rows = await drizzle
        .select({
          id: schema.callLogs.id,
          providerCallId: schema.callLogs.vapiCallId,
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
