import express, { type Response } from "express";
import { z } from "zod";

import { authenticateUser } from "../middleware/auth";
import { createRateLimiter, simulationMinuteQuota } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforceSpendCap } from "../lib/spend-guards";
import { validateBody } from "../lib/api-validation";
import { AppError } from "../lib/api-error";
import {
  commitRealtimeSessionSpend,
  releaseRealtimeSessionSpendAfterFailure,
  reserveRealtimeSessionSpend,
} from "../lib/realtime-spend-reservation";
import {
  generateCuratedVoicePreview,
  isCuratedPreviewProvider,
} from "../lib/voice/voice-preview-service";
import {
  createXAILiveVoiceSession,
  getXAILiveVoiceStatus,
  runXAILiveVoiceTool,
} from "../lib/voice/xai-live-agent-service";
import type { AuthenticatedRequest } from "../types/auth";
import liveProfileRouter from "./grok-live-profile-routes";
import xaiPhoneRouter from "./xai-voice-routes";

// Stable route family for Wireline live voice. Browser sessions now connect
// directly to xAI Realtime with server-minted ephemeral credentials. Production
// phone calls use the same model family through xAI SIP; Vapi is not in this path.
const router = express.Router();
// xAI Realtime intentionally follows the OpenAI-compatible event protocol.
// Keep the compatibility alias explicit so cost-protection contracts can assert
// the reservation occurs before any realtime provider mint without coupling to
// a vendor-specific implementation name.
const createOpenAIProtocolXAILiveVoiceSession = createXAILiveVoiceSession;
const sessionLimiter = createRateLimiter({
  bucket: "api:live-voice-session",
  windowMs: 60_000,
  max: 12,
  failClosedOnError: true,
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
  failClosedOnError: true,
});
const sessionSchema = z.object({
  agentId: z.string().min(1).max(200),
});
const toolSchema = z.object({
  agentId: z.string().min(1).max(200),
  name: z.string().max(80),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

// Native SIP webhook/provisioning routes share the same top-level voice router
// so route order remains stable while the legacy Vapi router is quarantined.
router.use(xaiPhoneRouter);
router.use(liveProfileRouter);

router.get(
  "/api/voices/curated/preview",
  authenticateUser,
  previewLimiter,
  enforceLaunchHardGate,
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
    res.setHeader("Cache-Control", "no-store");
    res.json(getXAILiveVoiceStatus());
  },
);

router.post(
  "/api/voice/live/session",
  authenticateUser,
  sessionLimiter,
  enforceLaunchHardGate,
  // This mint authorizes vendor-metered realtime audio outside the token audit
  // path, so it must respect both the tenant spend cap and simulation quota.
  enforceSpendCap,
  validateBody(sessionSchema),
  simulationMinuteQuota,
  async (req: AuthenticatedRequest, res: Response) => {
    const reservation = await reserveRealtimeSessionSpend(req, req.user.id, "live_voice_session");
    try {
      const session = await createOpenAIProtocolXAILiveVoiceSession({
        userId: req.user.id,
        agentId: req.body.agentId,
      });
      await commitRealtimeSessionSpend(reservation);
      res.setHeader("Cache-Control", "no-store");
      res.json(session);
    } catch (error) {
      await releaseRealtimeSessionSpendAfterFailure(req, reservation, error);
      throw error;
    }
  },
);

router.post(
  "/api/voice/live/tool",
  authenticateUser,
  toolLimiter,
  validateBody(toolSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await runXAILiveVoiceTool({
      userId: req.user.id,
      agentId: req.body.agentId,
      name: req.body.name,
      arguments: req.body.arguments || {},
    });
    res.json({ result });
  },
);

export default router;
