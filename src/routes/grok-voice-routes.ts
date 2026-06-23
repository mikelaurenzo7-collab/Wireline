import express, { type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import {
  createGrokVoiceClientSession,
  getGrokVoiceStatus,
  runGrokVoiceTool,
} from "../lib/voice/grok-voice-service";
import grokLiveProfileRouter from "./grok-live-profile-routes";

const router = express.Router();
const limiter = createRateLimiter({ bucket: "api:live-voice", windowMs: 60_000, max: 20 });
const sessionSchema = z.object({
  agentId: z.string().min(1).max(200),
  languageHint: z.string().max(20).optional(),
});
const toolSchema = z.object({
  agentId: z.string().min(1).max(200), name: z.string().max(80), arguments: z.record(z.string(), z.unknown()).optional() });

router.use(grokLiveProfileRouter);

router.get("/api/voice/live/status", authenticateUser, limiter, async (_req: AuthenticatedRequest, res: Response) => {
  res.json(getGrokVoiceStatus());
});

router.post("/api/voice/live/session", authenticateUser, limiter, validateBody(sessionSchema), async (req: AuthenticatedRequest, res: Response) => {
  const session = await createGrokVoiceClientSession({ userId: req.user.id, agentId: req.body.agentId, languageHint: req.body.languageHint });
  res.setHeader("Cache-Control", "no-store");
  res.json(session);
});

router.post("/api/voice/live/tool", authenticateUser, limiter, validateBody(toolSchema), async (req: AuthenticatedRequest, res: Response) => {
  const result = await runGrokVoiceTool({ userId: req.user.id, agentId: req.body.agentId, name: req.body.name, arguments: req.body.arguments || {} });
  res.json({ result });
});

export default router;
