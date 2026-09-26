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
    const reservation = await reserveRealtimeSessionSpend(req, req.user.id, "live_voice_session");
    try {
      const session = await createOpenAILiveVoiceCall({
        userId: req.user.id,
        agentId: req.body.agentId,
        sdp: req.body.sdp,
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
