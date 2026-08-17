import express, { type Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { validateBody } from "../lib/api-validation";
import { drizzle } from "../lib/server-context";
import { getLiveAvatarStatus } from "../lib/video-presenter/liveavatar-service";
import { isLiveVideoProvider } from "../lib/video-presenter/live-video-addon";
import { resolveLiveVideoEntitlement } from "../lib/video-presenter/live-video-entitlements";
import { resolveAgentVideoPresenter } from "../lib/video-presenter/resolve-agent-presenter";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { buildAgentIdentityPreview } from "../lib/agent-identity";
import { isOwnerEmail } from "../lib/auth-service";

const router = express.Router();

const LIVE_VIDEO_RETIRED_MESSAGE =
  "Live talking-head video is retired. Identity badges stay on every agent. Work companions draft clip scripts for recaps and kiosks.";

const presenterLimiter = createRateLimiter({
  bucket: "api:video-presenter",
  windowMs: 60_000,
  max: 30,
});

const sessionLimiter = createRateLimiter({
  bucket: "api:video-presenter-session",
  windowMs: 60_000,
  max: 12,
  failClosedOnError: true,
});

const patchPresenterSchema = z.object({
  avatarId: z.string().uuid().optional(),
  provider: z.enum(["liveavatar", "heygen", "synthetic", "tavus", "d-id", "simli"]).optional(),
});

async function ownedAgent(agentId: string, userId: string) {
  const [agent] = await drizzle
    .select({
      id: schema.agents.id,
      name: schema.agents.name,
      role: schema.agents.role,
      isBusinessAgent: schema.agents.isBusinessAgent,
      videoPresenterProvider: schema.agents.videoPresenterProvider,
      videoPresenterAvatarId: schema.agents.videoPresenterAvatarId,
      videoPresenterConsentStatus: schema.agents.videoPresenterConsentStatus,
      voiceId: schema.agents.voiceId,
      voiceProvider: schema.agents.voiceProvider,
    })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return agent ?? null;
}

function throwLiveVideoRetired(): never {
  throw new AppError(410, "LIVE_VIDEO_RETIRED", LIVE_VIDEO_RETIRED_MESSAGE);
}

router.get(
  "/api/video-presenter/status",
  authenticateUser,
  presenterLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.json(getLiveAvatarStatus());
  },
);

router.get(
  "/api/video-presenter/entitlement",
  authenticateUser,
  presenterLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const entitlement = await resolveLiveVideoEntitlement(req.user.id, {
      isOwner: isOwnerEmail(req.user.email),
    });
    res.json(entitlement);
  },
);

router.get("/api/video-presenter/avatars", authenticateUser, presenterLimiter, async () => {
  throwLiveVideoRetired();
});

router.get(
  "/api/video-presenter/avatars/:avatarId/matched-voice",
  authenticateUser,
  presenterLimiter,
  async () => {
    throwLiveVideoRetired();
  },
);

router.get(
  "/api/agents/:id/video-presenter",
  authenticateUser,
  presenterLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await ownedAgent(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    const presenter = resolveAgentVideoPresenter(agent);
    const identity = buildAgentIdentityPreview({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      isBusinessAgent: agent.isBusinessAgent,
      faceId: agent.videoPresenterAvatarId,
    });
    const addon = await resolveLiveVideoEntitlement(req.user.id, {
      isOwner: isOwnerEmail(req.user.email),
    });
    res.json({
      presenter,
      fallbackSeed: identity.seed,
      platform: getLiveAvatarStatus(),
      addon,
      hasVoice: Boolean(agent.voiceId?.trim()),
    });
  },
);

router.patch(
  "/api/agents/:id/video-presenter",
  authenticateUser,
  presenterLimiter,
  validateBody(patchPresenterSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await ownedAgent(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    if (!agent.isBusinessAgent) {
      throw AppError.fromHttpStatus(
        400,
        "Presenter customization is available for business agents only.",
      );
    }

    if (req.body.provider !== undefined) {
      if (isLiveVideoProvider(req.body.provider) || req.body.provider !== "synthetic") {
        throwLiveVideoRetired();
      }
    }

    if (req.body.avatarId !== undefined) {
      throwLiveVideoRetired();
    }

    const updated = await ownedAgent(agent.id, req.user.id);
    if (!updated) throw AppError.fromHttpStatus(404, "Agent not found");
    res.json({ presenter: resolveAgentVideoPresenter(updated) });
  },
);

router.post(
  "/api/agents/:id/video-presenter/session",
  authenticateUser,
  sessionLimiter,
  async () => {
    throwLiveVideoRetired();
  },
);

router.post(
  "/api/agents/:id/video-presenter/session/settle",
  authenticateUser,
  sessionLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.json({ settled: false, refundedMinutes: 0, reason: "live_video_retired" });
  },
);

router.post(
  "/api/agents/:id/video-presenter/enable",
  authenticateUser,
  presenterLimiter,
  async () => {
    throwLiveVideoRetired();
  },
);

router.post(
  "/api/agents/:id/video-presenter/sample",
  authenticateUser,
  sessionLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.status(410).json({
      code: "LIVE_VIDEO_SAMPLE_RETIRED",
      error: LIVE_VIDEO_RETIRED_MESSAGE,
    });
  },
);

export default router;
