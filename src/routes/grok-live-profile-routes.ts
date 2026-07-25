import express from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import {
  getOpenAILiveVoiceProfile,
  setOpenAILiveVoiceProfile,
  type WirelineLiveVoiceProfile,
} from "../lib/voice/openai-live-agent-service";

// Legacy filename retained for stable imports. Profiles now map exclusively to
// OpenAI Realtime voices; Vapi/ElevenLabs owns custom phone voices.
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
    if (!agentId)
      return res.status(400).json({ error: "agentId is required", code: "AGENT_ID_REQUIRED" });
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
      error: "Custom browser-demo voices are not supported. Configure custom phone voices through the Vapi voice library.",
      code: "LIVE_CUSTOM_VOICE_UNSUPPORTED",
      customVoiceConfigured: false,
    });
  },
);

export default router;
