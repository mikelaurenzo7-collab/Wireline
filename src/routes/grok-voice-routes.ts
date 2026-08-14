import express, { type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter, simulationMinuteQuota } from "../middleware/api-rate-limits";
import { persistPlatformCostRecord, platformCostReserveUsd } from "../middleware/audit-middleware";
import { enforceSpendCap } from "../lib/spend-guards";
import { validateBody } from "../lib/api-validation";
import { AppError } from "../lib/api-error";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "../lib/voice/openai-realtime-config";
import {
  generateCuratedVoicePreview,
  isCuratedPreviewProvider,
} from "../lib/voice/voice-preview-service";
import type { AuthenticatedRequest } from "../types/auth";
import {
  createOpenAILiveVoiceCall,
  getOpenAILiveVoiceStatus,
  runOpenAILiveVoiceTool,
} from "../lib/voice/openai-live-agent-service";
import liveProfileRouter from "./grok-live-profile-routes";

// Legacy filename retained to avoid route-registry churn. All /api/voice/live/*
// customer-facing demo traffic is OpenAI Realtime; phone demos remain on Vapi.
const router = express.Router();
const sessionLimiter = createRateLimiter({
  bucket: "api:live-voice-session",
  windowMs: 60_000,
  max: 12,
});
const toolLimiter = createRateLimiter({
  bucket: "api:live-voice-tool",
  windowMs: 60_000,
  max: 60,
});
const statusLimiter = createRateLimiter({
  bucket: "api:live-voice-status",
  windowMs: 60_000,
  max: 30,
});
const previewLimiter = createRateLimiter({
  bucket: "api:voice-preview",
  windowMs: 60_000,
  max: 20,
});
const sessionSchema = z.object({
  agentId: z.string().min(1).max(200),
  sdp: z.string().min(100).max(60_000),
});
const toolSchema = z.object({
  agentId: z.string().min(1).max(200),
  name: z.string().max(80),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

router.use(liveProfileRouter);

router.get(
  "/api/voices/curated/preview",
  authenticateUser,
  previewLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const provider = typeof req.query.provider === "string" ? req.query.provider : "";
    const voiceId = typeof req.query.voiceId === "string" ? req.query.voiceId.trim() : "";
    if (!isCuratedPreviewProvider(provider) || !voiceId)
      throw AppError.fromHttpStatus(400, "A valid provider and voice are required.");
    const audio = await generateCuratedVoicePreview(provider, voiceId);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(audio));
  },
);

router.get(
  "/api/voice/live/status",
  authenticateUser,
  statusLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.json(getOpenAILiveVoiceStatus());
  },
);

router.post(
  "/api/voice/live/session",
  authenticateUser,
  sessionLimiter,
  // Same posture as /api/voice/openai/session: the mint spends vendor-metered
  // realtime audio on platform keys outside the token audit path, so it must
  // respect the tenant's AI-spend hard cap and land a reserve in the envelope.
  // Cap BEFORE quota so a capped tenant's rejections don't consume the
  // durable daily minute debit.
  enforceSpendCap,
  simulationMinuteQuota,
  validateBody(sessionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const session = await createOpenAILiveVoiceCall({
      userId: req.user.id,
      agentId: req.body.agentId,
      sdp: req.body.sdp,
    });
    await persistPlatformCostRecord({
      userId: req.user.id,
      action: "voice.realtime.session",
      provider: "openai",
      model: OPENAI_REALTIME_DEFAULT_MODEL,
      costUsd: platformCostReserveUsd("openai_realtime_session"),
      requestMeta: { surface: "live_voice_session" },
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(session);
  },
);

router.post(
  "/api/voice/live/tool",
  authenticateUser,
  toolLimiter,
  validateBody(toolSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await runOpenAILiveVoiceTool({
      userId: req.user.id,
      agentId: req.body.agentId,
      name: req.body.name,
      arguments: req.body.arguments || {},
    });
    res.json({ result });
  },
);

export default router;
