import express, { type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter, simulationMinuteQuota } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforceSpendCap } from "../lib/spend-guards";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import {
  createOpenAIRealtimeSimulationCall,
  getOpenAIRealtimeStatus,
} from "../lib/voice/openai-realtime-service";
import {
  commitRealtimeSessionSpend,
  releaseRealtimeSessionSpendAfterFailure,
  reserveRealtimeSessionSpend,
} from "../lib/realtime-spend-reservation";

const router = express.Router();

// ChatGPT App private simulation mint. Studio uses its own account-bound
// `/api/voice/live/session` OpenAI WebRTC exchange; neither route is PSTN.

const openaiRealtimeLimiter = createRateLimiter({
  bucket: "api:openai-realtime",
  windowMs: 60_000,
  max: 20,
  failClosedOnError: true,
});

const openaiRealtimeSessionSchema = z.object({
  sdp: z.string().min(100).max(60_000),
  agentName: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(80).optional(),
  voice: z.string().min(1).max(40).optional(),
});

router.get(
  "/api/voice/openai/status",
  authenticateUser,
  openaiRealtimeLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.json(getOpenAIRealtimeStatus());
  },
);

router.post(
  "/api/voice/openai/session",
  authenticateUser,
  openaiRealtimeLimiter,
  enforceLaunchHardGate,
  // The server-created WebRTC call spends vendor-metered realtime audio on the
  // platform key, so signaling must respect the tenant's AI-spend hard cap and
  // land a reserve in the envelope before the provider call is created.
  // Cap BEFORE quota: the quota middleware durably debits five minutes, so a
  // capped tenant's rejected attempts must not eat the daily allowance they
  // would need after raising the cap.
  enforceSpendCap,
  validateBody(openaiRealtimeSessionSchema),
  simulationMinuteQuota,
  async (req: AuthenticatedRequest, res: Response) => {
    const reservation = await reserveRealtimeSessionSpend(req, req.user.id, "studio_simulation");
    let session: Awaited<ReturnType<typeof createOpenAIRealtimeSimulationCall>>;
    try {
      session = await createOpenAIRealtimeSimulationCall({
        userId: req.user.id,
        sdp: req.body.sdp,
        agentName: req.body.agentName,
        model: req.body.model,
        voice: req.body.voice,
        tools: [],
        toolChoice: "none",
      });
    } catch (error) {
      await releaseRealtimeSessionSpendAfterFailure(req, reservation, error);
      throw error;
    }
    await commitRealtimeSessionSpend(reservation);
    res.json(session);
  },
);

export default router;
