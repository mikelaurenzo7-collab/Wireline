import express from "express";
import { z } from "zod";

import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation";
import {
  getOpenAILiveVoiceProfile,
  setOpenAILiveVoiceProfile,
  type WirelineLiveVoiceProfile,
} from "../lib/voice/openai-live-agent-service";
import type { AuthenticatedRequest } from "../types/auth";

/** Customer Studio profiles select BotBound's curated OpenAI Realtime voices. */
const router = express.Router();
const limiter = createRateLimiter({ bucket: "api:live-voice-profile", windowMs: 60_000, max: 30 });
const profileSchema = z.object({
  agentId: z.string().min(1).max(200),
  profile: z.enum(["bright", "warm", "clear", "balanced", "direct"]),
});
const customVoiceSchema = z.object({
  agentId: z.string().min(1).max(200),
  customVoiceId: z.string().trim().min(3).max(160).nullable(),
});

router.get(
  "/api/voice/live/profile",
  authenticateUser,
  limiter,
  async (req: AuthenticatedRequest, res) => {
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId.slice(0, 200) : "";
    if (!agentId) {
      res.status(400).json({ error: "agentId is required", code: "AGENT_ID_REQUIRED" });
      return;
    }
    const selected = await getOpenAILiveVoiceProfile(req.user.id, agentId);
    res.setHeader("Cache-Control", "no-store");
    res.json(selected);
  },
);

router.patch(
  "/api/voice/live/profile",
  authenticateUser,
  limiter,
  validateBody(profileSchema),
  async (req: AuthenticatedRequest, res) => {
    const selected = await setOpenAILiveVoiceProfile(
      req.user.id,
      req.body.agentId,
      req.body.profile as WirelineLiveVoiceProfile,
    );
    res.json(selected);
  },
);

router.patch(
  "/api/voice/live/custom",
  authenticateUser,
  limiter,
  validateBody(customVoiceSchema),
  async (_req: AuthenticatedRequest, res) => {
    res.status(409).json({
      error:
        "Custom live voices are not enabled for this deployment. Choose a built-in BotBound voice profile.",
      code: "LIVE_CUSTOM_VOICE_UNSUPPORTED",
      customVoiceConfigured: false,
    });
  },
);

export default router;
