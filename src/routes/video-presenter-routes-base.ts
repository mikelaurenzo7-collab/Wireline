import express, { type Response } from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { validateBody } from "../lib/api-validation";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log } from "../lib/server-context";
import {
  getLiveAvatarStatus,
  listPublicAvatars,
  mintLiveAvatarSessionToken,
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
import {
  readLiveVideoPlatformConfig,
  resolveLiveVideoEngine,
} from "../lib/video-presenter/live-video-session-policy";
import { resolveLiveVideoEntitlement } from "../lib/video-presenter/live-video-entitlements";
import { LIVE_VIDEO_MAX_SESSION_SECONDS } from "../lib/video-presenter/live-video-policy";
import {
  releaseLiveVideoSessionReservation,
  reserveLiveVideoSessionMinutes,
} from "../lib/video-presenter/live-video-usage";
import {
  settleLiveVideoSession,
  signLiveVideoSettlementReceipt,
  verifyLiveVideoSettlementReceipt,
} from "../lib/video-presenter/live-video-settlement";
import { resolveAgentVideoPresenter } from "../lib/video-presenter/resolve-agent-presenter";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { buildAgentIdentityPreview } from "../lib/agent-identity";
import { isOwnerEmail } from "../lib/auth-service";
import { isCuratedElevenLabsVoiceId } from "../lib/managed-voice-runtime";

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
      // Starter, not Starter Plus. PAID_LIVE_VIDEO_PLANS admits `starter`
      // upward, and "Starter Plus" is the display name of the `team` plan —
      // this message was sending eligible Starter customers to buy a tier they
      // did not need.
      "Add the live video add-on to your plan to stream a presenter. Available on Starter and above.",
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

/**
 * The agent's PSTN-approved ElevenLabs voice, or null.
 *
 * Mirrors the live-call rule exactly: the provider must be ElevenLabs and the
 * voice must be curated or a database-approved clone owned by this tenant.
 * On the Studio-voice Live Video engine this is what lets the presenter speak
 * the same voice the agent uses on real phone calls — and an unapproved or
 * foreign voice id never leaves this function.
 */
async function approvedAgentElevenLabsVoice(
  agent: { voiceId: string | null; voiceProvider: string | null },
  userId: string,
): Promise<string | null> {
  const voiceId = agent.voiceId?.trim();
  if (!voiceId || agent.voiceProvider !== "11labs") return null;
  if (isCuratedElevenLabsVoiceId(voiceId)) return voiceId;
  const [clone] = await drizzle
    .select({ voiceId: schema.clonedVoices.voiceId })
    .from(schema.clonedVoices)
    .where(
      and(
        eq(schema.clonedVoices.voiceId, voiceId),
        eq(schema.clonedVoices.userId, userId),
        eq(schema.clonedVoices.status, "approved"),
      ),
    )
    .limit(1);
  return clone ? voiceId : null;
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
    const entitlement = await resolveLiveVideoEntitlement(req.user.id, {
      isOwner: isOwnerEmail(req.user.email),
    });
    if (!entitlement.billingEntitled) {
      throwLiveVideoBillingError(entitlement);
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

    // Resolve the engine before reserving: FULL-mode engines burn provider
    // credits at 2× LITE for the same wall-clock session, so the allowance
    // must draw down at the resolved engine's rate. Resolution is a pure
    // function of the request and env config, so the mint below resolves to
    // the same engine.
    const requestedEngine = (req.body as { voiceEngine?: unknown } | undefined)?.voiceEngine;
    const engineResolution = resolveLiveVideoEngine({
      requested: requestedEngine,
      config: readLiveVideoPlatformConfig(),
    });

    const reservation = await reserveLiveVideoSessionMinutes(req.user.id, {
      creditsPerMinute: engineResolution.creditsPerMinute,
    });
    if (!reservation.reserved) {
      throw new AppError(
        429,
        "LIVE_VIDEO_MONTHLY_LIMIT_REACHED",
        `Monthly Live Video allowance reached. Your ${reservation.usage.includedMinutes} reserved session minutes reset at the start of the next UTC month.`,
        { usage: reservation.usage },
      );
    }

    let liveSession: Awaited<ReturnType<typeof mintLiveAvatarSessionToken>>;
    try {
      liveSession = await mintLiveAvatarSessionToken({
        avatarId: presenter.avatarId,
        maxSessionDurationSeconds: LIVE_VIDEO_MAX_SESSION_SECONDS,
        // Server-owned resolution: an unavailable or unknown engine degrades to
        // the managed Wireline voice rather than failing the session.
        requestedEngine,
        // Same voice on the phone and on screen: when the agent's phone voice
        // is a PSTN-approved ElevenLabs voice, the Studio-voice presenter
        // speaks with it instead of the workspace default.
        agentElevenLabsVoiceId: await approvedAgentElevenLabsVoice(agent, req.user.id),
      });
    } catch (error) {
      try {
        await releaseLiveVideoSessionReservation(
          req.user.id,
          reservation.usage.periodKey,
          reservation.reservedMinutes,
        );
      } catch (releaseError) {
        log.error("Live Video reservation release failed after provider mint error", {
          periodKey: reservation.usage.periodKey,
          error: getErrorMessage(releaseError),
        });
      }
      throw error;
    }

    res.json({
      configured: true,
      fallbackSeed: identity.seed,
      presenter,
      usage: reservation.usage,
      live: {
        provider: "liveavatar",
        sessionToken: liveSession.sessionToken,
        sandbox: liveSession.sandbox,
        maxSessionSeconds: LIVE_VIDEO_MAX_SESSION_SECONDS,
        // Single-use receipt the stage returns when it closes, so the minutes
        // this session did not actually use go back to the allowance.
        settlementReceipt: signLiveVideoSettlementReceipt({
          userId: req.user.id,
          periodKey: reservation.usage.periodKey,
          reservedMinutes: reservation.reservedMinutes,
          creditsPerMinute: engineResolution.creditsPerMinute,
          nonce: randomUUID(),
        }),
        // The client needs the resolved mode to know whether it must stream
        // PCM itself (LITE + Wireline voice) or only render the provider's
        // track (FULL, or a provider-side LITE connector).
        mode: liveSession.mode,
        voiceEngine: liveSession.engine,
        creditsPerMinute: liveSession.creditsPerMinute,
        // The configuration hint behind a degrade names workspace env vars;
        // it is logged server-side at mint time. Tenants get the fact.
        ...(liveSession.degradedFrom ? { degradedFrom: liveSession.degradedFrom } : {}),
      },
    });
  },
);

const settleSessionSchema = z.object({
  receipt: z.string().min(1).max(2048),
  // Seconds of presenter the customer actually watched. Bounded to a generous
  // multiple of the hard cap so a malformed client cannot claim a long session
  // to avoid a refund — the refund is clamped to the reservation either way.
  watchedSeconds: z
    .number()
    .finite()
    .min(0)
    .max(LIVE_VIDEO_MAX_SESSION_SECONDS * 4),
});

/**
 * Return the unused slice of a session's reserved minutes.
 *
 * The reservation is taken in full at mint time, before the browser has proven
 * it can reach the provider. Without this route a customer whose network blocks
 * WebRTC spent five minutes of allowance per attempt and never saw a frame.
 */
router.post(
  "/api/agents/:id/video-presenter/session/settle",
  authenticateUser,
  sessionLimiter,
  validateBody(settleSessionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const agent = await ownedAgent(req.params.id, req.user.id);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

    const claim = verifyLiveVideoSettlementReceipt(req.body.receipt);
    // A receipt is bound to the tenant it was minted for. An expired or
    // tampered receipt simply settles nothing — it must never be an error the
    // stage surfaces to a customer who has already finished their session.
    if (!claim || claim.userId !== req.user.id) {
      res.json({ settled: false, refundedMinutes: 0, reason: "receipt_not_settleable" });
      return;
    }

    const result = await settleLiveVideoSession({
      claim,
      watchedSeconds: Number(req.body.watchedSeconds),
    });
    res.json(result);
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

/**
 * Retired compatibility endpoint.
 *
 * The old implementation synthesized MP3 bytes and labeled the result as a
 * lip-sync sample even though LiveAvatar LITE's audio control accepts raw 24 kHz
 * PCM. The mounted Studio now pipes the real Wireline Realtime PCM stream into
 * LiveAvatar instead, preserving the agent's actual Training, tools, and voice.
 */
router.post(
  "/api/agents/:id/video-presenter/sample",
  authenticateUser,
  sessionLimiter,
  async (_req: AuthenticatedRequest, res: Response) => {
    res.status(410).json({
      code: "LIVE_VIDEO_SAMPLE_RETIRED",
      error: "Presenter samples now use the agent's live Wireline voice in Studio.",
    });
  },
);

export default router;
