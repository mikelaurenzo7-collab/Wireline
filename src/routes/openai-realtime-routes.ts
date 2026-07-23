import express, { type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter, simulationMinuteQuota } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import {
  createOpenAIRealtimeClientSecret,
  getOpenAIRealtimeStatus,
} from "../lib/voice/openai-realtime-service";

const router = express.Router();

const openaiRealtimeLimiter = createRateLimiter({
  bucket: "api:openai-realtime",
  windowMs: 60_000,
  max: 20,
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
  simulationMinuteQuota,
  validateBody(openaiRealtimeSessionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const session = await createOpenAIRealtimeClientSecret({
      userId: req.user.id,
      agentName: req.body.agentName,
      model: req.body.model,
      voice: req.body.voice,
    });
    res.json(session);
  },
);

export default router;
