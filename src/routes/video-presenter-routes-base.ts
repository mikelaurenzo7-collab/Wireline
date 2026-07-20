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
  resolveAvatarDefaultVoice,
  getPresenterVoice,
} from "../lib/video-presenter/heygen-voice-service";
import {
  agentLiveVideoOptedIn,
  isLiveVideoPlatformAvailable,
  isLiveVideoProvider,
} from "../lib/video-presenter/live-video-addon";
import { resolveLiveVideoEntitlement } from "../lib/video-presenter/live-video-entitlements";
import { resolveAgentVideoPresenter } from "../lib/video-presenter/resolve-agent-presenter";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { buildAgentIdentityPreview } from "../lib/agent-identity";
import {
  generatePresenterSpeech,
  presenterVoicesConfigured,
} from "../lib/video-presenter/heygen-voice-service";
import { isOwnerEmail } from "../lib/auth-service";

const router = express.Router();

function throwLiveVideoBillingError(
  entitlement: Awaited<ReturnType<typeof resolveLiveVideoEntitlement>>,
) {
  if (!entitlement.platformConfigured) {
    throw AppError.fromHttpStatus(
      503,
      entitlement.reason || "Live video is not available on this workspace.",
    );
  }
  throw new AppError(
    402,
    "LIVE_VIDEO_UPGRADE_REQUIRED",
    entitlement.reason ||
      "Subscribe to the live video add-on or upgrade to Starter Plus to stream photoreal presenters.",
    { plan_id: entitlement.planId },
  );
}

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
      voiceProvider: schema.agents.voiceProvider,
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
  "/api/video-presenter/avatars/:avatarId/matched-voice",
  authenticateUser,
  presenterLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const status = getLiveAvatarStatus();
    if (!status.configured) {
      throw AppError.fromHttpStatus(503, "Live video catalog is not configured.");
    }
    const avatarId = req.params.avatarId?.trim();
    if (!avatarId) throw AppError.fromHttpStatus(400, "avatarId is required.");

    let voiceId = String(req.query.default_voice_id || "").trim() || null;
    let voiceName: string | undefined;

    if (!voiceId) {
      const resolved = await resolveAvatarDefaultVoice(avatarId);
      voiceId = resolved?.voiceId ?? null;
      voiceName = resolved?.name;
    }

    if (!voiceId) {
      res.json({ avatarId, matched: false as const });
      return;
    }

    const voice = await getPresenterVoice(voiceId);

    res.json({
      avatarId,
      matched: true as const,
      voice: {
        voiceId,
        name: voiceName ?? voice?.name ?? "Presenter voice",
        provider: "presenter",
      },
    });
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
      throw new AppError(
        400,
        "LIVE_VIDEO_NOT_ENABLED",
        "Enable the live video add-on before starting a session.",
      );
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
      const code = !agentLiveVideoOptedIn(agent)
        ? "LIVE_VIDEO_NOT_ENABLED"
        : !presenter.avatarId
          ? "LIVE_VIDEO_AVATAR_REQUIRED"
          : "LIVE_VIDEO_NOT_READY";
      res.status(400).json({
        configured: false,
        code,
        fallbackSeed: identity.seed,
        presenter,
        error:
          code === "LIVE_VIDEO_AVATAR_REQUIRED"
            ? "Pick a catalog presenter face, then preview again."
            : code === "LIVE_VIDEO_NOT_ENABLED"
              ? "Enable the live video add-on before previewing."
              : "Live presenter is not ready yet.",
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
    const entitlement = await resolveLiveVideoEntitlement(req.user.id, {
      isOwner: isOwnerEmail(req.user.email),
    });
    if (!entitlement.billingEntitled) {
      throwLiveVideoBillingError(entitlement);
    }
    if (!isLiveVideoPlatformAvailable()) {
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
      throw new AppError(
        400,
        "LIVE_VIDEO_NOT_ENABLED",
        "Enable the live video add-on before voice preview.",
      );
    }

    const presenter = resolveAgentVideoPresenter(agent);
    if (!presenter.avatarId) {
      throw new AppError(
        400,
        "LIVE_VIDEO_AVATAR_REQUIRED",
        "Pick a catalog presenter face before voice preview.",
      );
    }
    if (presenter.status !== "ready") {
      throw new AppError(
        400,
        "LIVE_VIDEO_NOT_READY",
        "Live presenter must be ready before voice preview.",
      );
    }

    const sampleText = `Hi, I'm ${agent.name}. Thanks for calling — how can I help you today?`;

    if (!presenterVoicesConfigured()) {
      throw AppError.fromHttpStatus(503, "Presenter voice preview is not configured.");
    }

    // The lip-sync preview always renders through the presenter (HeyGen) voice
    // layer. A presenter-voice agent uses its own voice; any other agent falls
    // back to the avatar's matched presenter voice.
    const voiceProvider = (agent.voiceProvider || "vapi").trim().toLowerCase();
    let presenterVoiceId = voiceProvider === "presenter" ? agent.voiceId?.trim() || null : null;
    if (!presenterVoiceId) {
      const resolved = await resolveAvatarDefaultVoice(presenter.avatarId);
      presenterVoiceId = resolved?.voiceId ?? null;
    }
    if (!presenterVoiceId) {
      throw new AppError(
        400,
        "LIVE_VIDEO_NO_VOICE",
        "Pick a presenter voice for this agent before previewing.",
      );
    }

    const mp3 = await generatePresenterSpeech({ voiceId: presenterVoiceId, text: sampleText });
    const chunkSize = 48_000;
    const view = new Uint8Array(mp3);
    const chunks: string[] = [];
    for (let offset = 0; offset < view.byteLength; offset += chunkSize) {
      const slice = view.subarray(offset, Math.min(offset + chunkSize, view.byteLength));
      chunks.push(Buffer.from(slice).toString("base64"));
    }

    res.json({
      eventId: randomUUID(),
      format: "mp3",
      chunks,
      sampleText,
    });
  },
);

export default router;
