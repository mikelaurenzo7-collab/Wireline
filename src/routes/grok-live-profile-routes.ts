import express from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import { drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import {
  WIRELINE_LIVE_VOICE_PROFILES,
  normalizeWirelineVoiceProfile,
  resolveWirelineGrokVoice,
  resolveWirelineVoiceProfile,
  type WirelineVoiceProfile,
} from "../lib/voice/grok-voice-config";

const router = express.Router();
const limiter = createRateLimiter({ bucket: "api:live-voice-profile", windowMs: 60_000, max: 30 });
const profileSchema = z.object({
  agentId: z.string().min(1).max(200),
  profile: z.enum(["bright", "warm", "clear", "balanced", "direct"]),
});
const customVoiceSchema = z.object({
  agentId: z.string().min(1).max(200),
  customVoiceId: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .nullable(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function loadProfile(userId: string, agentId: string) {
  const rows = await drizzle
    .select({ role: schema.agents.role, businessVariables: schema.agents.businessVariables })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  const agent = rows[0];
  if (!agent) return null;
  const variables = asRecord(agent.businessVariables);
  const nested = asRecord(variables.voice);
  const stored = normalizeWirelineVoiceProfile(
    variables.wirelineLiveVoiceProfile || nested.wirelineLiveVoiceProfile,
  );
  return {
    agent,
    profile: resolveWirelineVoiceProfile(agent.role, stored),
    customVoiceConfigured: variables.wirelineLiveCustomVoice === true,
  };
}

router.get("/api/voice/live/profile", authenticateUser, limiter, async (req: AuthenticatedRequest, res) => {
  const agentId = typeof req.query.agentId === "string" ? req.query.agentId.slice(0, 200) : "";
  if (!agentId) return res.status(400).json({ error: "agentId is required" });
  const selected = await loadProfile(req.user.id, agentId);
  if (!selected) return res.status(404).json({ error: "Assistant not found" });
  res.setHeader("Cache-Control", "no-store");
  res.json({
    profile: selected.profile,
    profiles: WIRELINE_LIVE_VOICE_PROFILES,
    customVoiceConfigured: selected.customVoiceConfigured,
  });
});

router.patch("/api/voice/live/profile", authenticateUser, limiter, validateBody(profileSchema), async (req: AuthenticatedRequest, res) => {
  const selected = await loadProfile(req.user.id, req.body.agentId);
  if (!selected) return res.status(404).json({ error: "Assistant not found" });
  const profile = req.body.profile as WirelineVoiceProfile;
  await drizzle
    .update(schema.agents)
    .set({
      businessVariables: {
        ...asRecord(selected.agent.businessVariables),
        wirelineLiveVoiceProfile: profile,
        wirelineLiveCustomVoice: false,
        grokVoiceId: resolveWirelineGrokVoice(selected.agent.role, profile),
      },
    })
    .where(and(eq(schema.agents.id, req.body.agentId), eq(schema.agents.userId, req.user.id)));
  res.json({ profile, profiles: WIRELINE_LIVE_VOICE_PROFILES, customVoiceConfigured: false });
});

router.patch("/api/voice/live/custom", authenticateUser, limiter, validateBody(customVoiceSchema), async (req: AuthenticatedRequest, res) => {
  const selected = await loadProfile(req.user.id, req.body.agentId);
  if (!selected) return res.status(404).json({ error: "Assistant not found" });
  const customVoiceId = req.body.customVoiceId;
  await drizzle
    .update(schema.agents)
    .set({
      businessVariables: {
        ...asRecord(selected.agent.businessVariables),
        wirelineLiveCustomVoice: Boolean(customVoiceId),
        grokVoiceId: customVoiceId || resolveWirelineGrokVoice(selected.agent.role, selected.profile),
      },
    })
    .where(and(eq(schema.agents.id, req.body.agentId), eq(schema.agents.userId, req.user.id)));
  res.json({ customVoiceConfigured: Boolean(customVoiceId) });
});

export default router;
