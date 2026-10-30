import express, { type Response } from "express";
import { z } from "zod";

import { authenticateUser } from "../middleware/auth";
import { createRateLimiter, simulationMinuteQuota } from "../middleware/api-rate-limits";
import { enforceVoiceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforcePrivateVoiceSimulationSpendCap } from "../lib/spend-guards";
import { validateBody } from "../lib/api-validation";
import {
  commitRealtimeSessionSpend,
  releaseRealtimeSessionSpendAfterFailure,
  reserveRealtimeSessionSpend,
} from "../lib/realtime-spend-reservation";
import {
  createOpenAILiveVoiceCall,
  getOpenAILiveVoiceStatus,
  runOpenAILiveVoiceTool,
} from "../lib/voice/openai-live-agent-service";
import { getEffectiveSubscriptionPlanId, subscriptionPlanToTier } from "../lib/plan-entitlements";
import { OPENAI_FREE_REHEARSAL_SECONDS } from "../lib/voice/openai-realtime-pricing";
import { stopOpenAILiveVoiceCall } from "../lib/voice/live-voice-cleanup";
import type { AuthenticatedRequest } from "../types/auth";
import liveProfileRouter from "./live-voice-profile-routes";

const router = express.Router();
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
const stopLimiter = createRateLimiter({
  bucket: "api:live-voice-stop",
  windowMs: 60_000,
  max: 60,
});
const sessionSchema = z.object({
  agentId: z.string().min(1).max(200),
  sdp: z.string().min(100).max(60_000),
});
const stopSchema = z.object({ cleanupToken: z.string().min(1).max(2_048) }).strict();
const toolSchema = z.object({
  agentId: z.string().min(1).max(200),
  name: z.string().max(80),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

router.use(liveProfileRouter);

router.get(
  "/api/voice/live/status",
  authenticateUser,
  statusLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(getOpenAILiveVoiceStatus());
  },
);

router.post(
  "/api/voice/live/session",
  authenticateUser,
  sessionLimiter,
  // Voice-stack hard gate only. Closed self-serve checkout must not fail
  // Studio Preview Voice; checkout and number provision keep their own fences.
  enforceVoiceLaunchHardGate,
  enforcePrivateVoiceSimulationSpendCap,
  validateBody(sessionSchema),
  simulationMinuteQuota,
  async (req: AuthenticatedRequest, res: Response) => {
    // Free Builder rehearses in shorter sessions that reserve less, so its
    // allowance covers several voice tests.
    const freeBuilder =
      subscriptionPlanToTier(await getEffectiveSubscriptionPlanId(req.user.id, req.user.email)) ===
      "free";
    const windowSeconds = freeBuilder ? OPENAI_FREE_REHEARSAL_SECONDS : undefined;
    const reservation = await reserveRealtimeSessionSpend(
      req,
      req.user.id,
      "live_voice_session",
      undefined,
      undefined,
      windowSeconds,
    );
    try {
      const session = await createOpenAILiveVoiceCall({
        userId: req.user.id,
        agentId: req.body.agentId,
        sdp: req.body.sdp,
        maxDurationSeconds: windowSeconds,
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
  "/api/voice/live/session/stop",
  authenticateUser,
  // Stopping a rehearsal must remain possible after its allowance is used or
  // voice admissions close. There are no spend or admission gates here.
  stopLimiter,
  validateBody(stopSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await stopOpenAILiveVoiceCall({
      userId: req.user.id,
      cleanupToken: req.body.cleanupToken,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
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

// Retired legacy provider entry points are explicit tombstones. Keep their
// former URLs for predictable client failures without loading Gemini provider
// code, accepting billable sessions, or revealing provider configuration.
const retiredGeminiResponse = (_req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({
    ok: false,
    code: "VOICE_PROVIDER_RETIRED",
    error: "This voice provider is no longer available.",
  });
};

router.get("/api/voice/live/gemini/status", statusLimiter, retiredGeminiResponse);
router.post(
  "/api/voice/live/gemini/session",
  authenticateUser,
  sessionLimiter,
  retiredGeminiResponse,
);
router.post(
  "/api/voice/live/gemini/tool",
  authenticateUser,
  toolLimiter,
  retiredGeminiResponse,
);

export default router;
