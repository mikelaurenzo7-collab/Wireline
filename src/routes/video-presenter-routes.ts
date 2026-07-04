import express, { type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { validateBody } from "../lib/api-validation";
import { drizzle } from "../lib/server-context";
import {
  getLiveAvatarStatus,
  listPublicAvatars,
  mintLiveAvatarLiteSessionToken,
} from "../lib/video-presenter/liveavatar-service";
import {
  agentLiveVideoOptedIn,
  isLiveVideoAddonOffered,
  isLiveVideoProvider,
} from "../lib/video-presenter/live-video-addon";
import { resolveAgentVideoPresenter } from "../lib/video-presenter/resolve-agent-presenter";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { buildAgentIdentityPreview } from "../lib/agent-identity";
import { elevenLabsConfigured, generateSamplePcm24 } from "../lib/elevenlabs-client";

const router = express.Router();

const presenterLimiter = createRateLimiter({
  bucket: "api:video-presenter",
  windowMs: 60_000,
  max: 30,
});

const sessionLimiter = createRateLimiter({
  bucket: "api:video-presenter-session",
  windowMs: 60_000,
  max: 12,
});

const patchPresenterSchema = z.object({
  avatarId: z.string().uuid().optional(),
  provider: z.enum(["liveavatar", "heygen", "synthetic", "tavus", "d-id", "simli"]).optional(),
  consentStatus: z.enum(["not_started", "pending", "approved", "rejected"]).optional(),
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
    })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return agent ?? null;
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
  "/api/video-presenter/avatars",
  authenticateUser,
  presenterLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    const status = getLiveAvatarStatus();
    if (!status.configured) {
      throw AppError.fromHttpStatus(503, "Live video catalog is not configured.");
    }
    const avatars = await listPublicAvatars();
    res.json({ avatars, sandbox: status.sandbox });
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
    res.json({ presenter, fallbackSeed: identity.seed, platform: getLiveAvatarStatus() });
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
      if (isLiveVideoProvider(req.body.provider)) {
        throw AppError.fromHttpStatus(
          400,
          "Use POST /api/agents/:id/video-presenter/enable to turn on live video.",
        );
      }
      throw AppError.fromHttpStatus(400, "Presenter provider cannot be changed here.");
    }

    const patch: Record<string, string | null> = {};
    if (req.body.avatarId !== undefined) patch.videoPresenterAvatarId = req.body.avatarId;
    if (req.body.consentStatus !== undefined) {
      patch.videoPresenterConsentStatus = req.body.consentStatus;
    }

    if (Object.keys(patch).length) {
      await drizzle
        .update(schema.agents)
        .set(patch)
        .where(and(eq(schema.agents.id, agent.id), eq(schema.agents.userId, req.user.id)));
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
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await ownedAgent(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    if (!agent.isBusinessAgent) {
      throw AppError.fromHttpStatus(400, "Live video is available for business agents only.");
    }
    if (!agentLiveVideoOptedIn(agent)) {
      throw AppError.fromHttpStatus(400, "Enable the live video add-on before starting a session.");
    }

    const presenter = resolveAgentVideoPresenter(agent);
    const identity = buildAgentIdentityPreview({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      isBusinessAgent: agent.isBusinessAgent,
      faceId: agent.videoPresenterAvatarId,
    });

    if (presenter.status !== "ready" || !presenter.avatarId) {
      res.json({
        configured: false,
        fallbackSeed: identity.seed,
        presenter,
      });
      return;
    }

    const { sessionToken, sandbox } = await mintLiveAvatarLiteSessionToken({
      avatarId: presenter.avatarId,
      maxSessionDurationSeconds: 600,
    });

    res.json({
      configured: true,
      fallbackSeed: identity.seed,
      presenter,
      live: {
        provider: "liveavatar",
        sessionToken,
        sandbox,
      },
    });
  },
);

router.post(
  "/api/agents/:id/video-presenter/enable",
  authenticateUser,
  presenterLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await ownedAgent(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    if (!agent.isBusinessAgent) {
      throw AppError.fromHttpStatus(400, "Live video is available for business agents only.");
    }
    if (!isLiveVideoAddonOffered()) {
      throw AppError.fromHttpStatus(503, "Live video add-on is not available on this workspace.");
    }

    await drizzle
      .update(schema.agents)
      .set({
        videoPresenterProvider: "liveavatar",
        videoPresenterConsentStatus: "approved",
      })
      .where(and(eq(schema.agents.id, agent.id), eq(schema.agents.userId, req.user.id)));

    const updated = await ownedAgent(agent.id, req.user.id);
    if (!updated) throw AppError.fromHttpStatus(404, "Agent not found");
    res.json({ presenter: resolveAgentVideoPresenter(updated) });
  },
);

/** PCM lip-sync sample — agent voice rendered for LiveAvatar LITE preview. */
router.post(
  "/api/agents/:id/video-presenter/sample",
  authenticateUser,
  sessionLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await ownedAgent(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
    if (!agent.isBusinessAgent) {
      throw AppError.fromHttpStatus(400, "Live video is available for business agents only.");
    }
    if (!agentLiveVideoOptedIn(agent)) {
      throw AppError.fromHttpStatus(400, "Enable the live video add-on before voice preview.");
    }

    const presenter = resolveAgentVideoPresenter(agent);
    if (presenter.status !== "ready") {
      throw AppError.fromHttpStatus(400, "Live presenter must be ready before voice preview.");
    }
    if (!elevenLabsConfigured()) {
      throw AppError.fromHttpStatus(503, "Voice preview is not configured.");
    }
    const voiceId = agent.voiceId?.trim();
    if (!voiceId) {
      throw AppError.fromHttpStatus(400, "Pick a voice for this agent before previewing.");
    }

    const sampleText = `Hi, I'm ${agent.name}. Thanks for calling — how can I help you today?`;
    const pcm = await generateSamplePcm24({ voiceId, text: sampleText });

    const bytesPerSecond = 24_000 * 2;
    const chunks: string[] = [];
    const view = new Uint8Array(pcm);
    for (let offset = 0; offset < view.byteLength; offset += bytesPerSecond) {
      const slice = view.subarray(offset, Math.min(offset + bytesPerSecond, view.byteLength));
      chunks.push(Buffer.from(slice).toString("base64"));
    }

    res.json({
      eventId: randomUUID(),
      chunks,
      sampleText,
    });
  },
);

export default router;
