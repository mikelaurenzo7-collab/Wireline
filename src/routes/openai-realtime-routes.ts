import express, { type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter, simulationMinuteQuota } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforceSpendCap } from "../lib/spend-guards";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import {
  createOpenAIRealtimeClientSecret,
  getOpenAIRealtimeStatus,
} from "../lib/voice/openai-realtime-service";
import {
  commitRealtimeSessionSpend,
  releaseRealtimeSessionSpendAfterFailure,
  reserveRealtimeSessionSpend,
} from "../lib/realtime-spend-reservation";

const router = express.Router();

const openaiRealtimeLimiter = createRateLimiter({
  bucket: "api:openai-realtime",
  windowMs: 60_000,
  max: 20,
  failClosedOnError: true,
});

const openaiRealtimeSessionSchema = z.object({
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
  // The minted secret spends vendor-metered realtime audio on the platform
  // key, and browser-to-vendor WebRTC audio never reaches the token audit
  // path — so the mint itself must respect the tenant's AI-spend hard cap and
  // land a reserve in the envelope. Without both, a tenant already 402'd on
  // text AI could still mint voice sessions all day as invisible COGS.
  // Cap BEFORE quota: the quota middleware durably debits five minutes, so a
  // capped tenant's rejected attempts must not eat the daily allowance they
  // would need after raising the cap.
  enforceSpendCap,
  validateBody(openaiRealtimeSessionSchema),
  simulationMinuteQuota,
  async (req: AuthenticatedRequest, res: Response) => {
    const reservation = await reserveRealtimeSessionSpend(req, req.user.id, "studio_simulation");
    let session: Awaited<ReturnType<typeof createOpenAIRealtimeClientSecret>>;
    try {
      session = await createOpenAIRealtimeClientSecret({
        userId: req.user.id,
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
