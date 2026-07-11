import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * /api/voices — voice catalog + cloning surface.
 *
 * GET    /api/voices                   — list catalog + this user's clones
 * GET    /api/voices/:id/preview       — proxy public premade ElevenLabs preview MP3
 * POST   /api/voices/clone             — instant clone from an authorized audio sample
 * DELETE /api/voices/:id               — remove a cloned voice from provider + tenant catalog
 *
 * Cost discipline: cloning is a spend-sensitive operation. The route requires
 * authenticated, per-user distributed rate limiting and refuses production
 * traffic when that control is unavailable.
 *
 * Privacy: every clone requires an explicit consent basis. Before audio leaves
 * Wireline, the attestation, sample digest, request context, and consent-policy
 * version are durably written to the existing audit log.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { auditLogger, log, drizzle } from "../lib/server-context";
import { distributedLimiterStatus, rateLimit } from "../lib/rate-limit";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";
import {
  listVoices as elListVoices,
  createInstantClone,
  deleteVoice as elDeleteVoice,
  isolateVoice,
  elevenLabsConfigured,
  type ElevenLabsVoice,
} from "../lib/elevenlabs-client";
import {
  generateCuratedVoicePreview,
  isCuratedPreviewProvider,
} from "../lib/voice/voice-preview-service";
import {
  getPresenterVoice,
  listPresenterVoices,
  presenterVoicesConfigured,
  assertTrustedHeyGenMediaUrl,
} from "../lib/video-presenter/heygen-voice-service";

const router = Router();

const VOICE_CLONE_WINDOW_MS = 24 * 60 * 60_000;
const VOICE_CLONE_MAX = 5;
const VOICE_CONSENT_VERSION = "wireline_voice_consent_v1";
const MAX_VOICE_SAMPLE_BYTES = 25 * 1024 * 1024;
const MIN_VOICE_SAMPLE_BYTES = 1_000;
const ALLOWED_VOICE_SAMPLE_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "application/ogg",
]);

type VoiceConsentBasis = "self" | "authorized_third_party";

function isVoiceConsentBasis(value: unknown): value is VoiceConsentBasis {
  return value === "self" || value === "authorized_third_party";
}

function decodeVoiceSample(audioBase64: unknown, audioMimeType: unknown) {
  if (typeof audioBase64 !== "string") {
    throw AppError.fromHttpStatus(400, "Audio sample required (30–90 seconds recommended).");
  }
  const mimeType = typeof audioMimeType === "string" ? audioMimeType.trim().toLowerCase() : "";
  if (!ALLOWED_VOICE_SAMPLE_MIME_TYPES.has(mimeType)) {
    throw AppError.fromHttpStatus(400, "Use an MP3, WAV, M4A, MP4, or OGG audio sample.");
  }

  const compact = audioBase64.replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw AppError.fromHttpStatus(400, "Audio sample is not valid base64 data.");
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length < MIN_VOICE_SAMPLE_BYTES) {
    throw AppError.fromHttpStatus(400, "Audio sample is too short (30–90 seconds recommended).");
  }
  if (bytes.length > MAX_VOICE_SAMPLE_BYTES) {
    throw AppError.fromHttpStatus(413, "Audio sample too large (maximum 25 MB).");
  }

  return {
    bytes,
    base64: bytes.toString("base64"),
    mimeType,
  };
}

async function cloneRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as AuthenticatedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ code: "UNAUTHORIZED", error: "Authentication required." });
    return;
  }

  const status = distributedLimiterStatus();
  if (!status.ok) {
    res.status(503).json({ code: status.code, error: status.reason });
    return;
  }

  try {
    const result = await rateLimit(userId, {
      bucket: "api:voice-clone",
      windowMs: VOICE_CLONE_WINDOW_MS,
      max: VOICE_CLONE_MAX,
      failClosedOnError: true,
    });
    res.set("RateLimit-Limit", String(VOICE_CLONE_MAX));
    res.set("RateLimit-Remaining", String(result.remaining));
    res.set("RateLimit-Reset", String(Math.ceil((Date.now() + result.resetMs) / 1000)));
    if (!result.allowed) {
      res.set("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      res.status(429).json({
        code: "VOICE_CLONE_LIMIT",
        error: "Voice creation limit reached. Try again after the rate-limit window resets.",
      });
      return;
    }
    next();
  } catch (error) {
    log.error("voice clone rate limiter unavailable", { error: getErrorMessage(error), userId });
    res.status(503).json({
      code: "RATE_LIMITER_ERROR",
      error: "Voice creation is temporarily unavailable because cost controls could not be verified.",
    });
  }
}

async function recordVoiceAudit(
  req: AuthenticatedRequest,
  eventName: string,
  metadata: Record<string, unknown>,
) {
  return await auditLogger.logDataModification("product.event", {
    userId: req.user.id,
    resource: "voice_identity",
    ip: req.ip,
    metadata: {
      event_name: eventName,
      request_id: req.headers["x-request-id"] || undefined,
      user_agent: req.get("user-agent")?.slice(0, 256),
      ...metadata,
    },
  });
}

/** Public curated previews may call metered providers — cap per IP to prevent abuse. */
import { createIpRateLimiter } from "../middleware/api-rate-limits";
const curatedPreviewRateLimiter = createIpRateLimiter({
  bucket: "api:voice-curated-preview",
  windowMs: 60_000,
  max: 30,
  message: { error: "Preview limit reached. Try again in a minute." },
});

// GET /api/voices — merged catalog.
router.get("/api/voices", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let ownClones: Array<{ voiceId: string; name: string; previewUrl: string | null }> = [];
    try {
      const rows = await drizzle
        .select({
          voiceId: schema.clonedVoices.voiceId,
          name: schema.clonedVoices.name,
          previewUrl: schema.clonedVoices.previewUrl,
        })
        .from(schema.clonedVoices)
        .where(eq(schema.clonedVoices.userId, req.user.id))
        .orderBy(desc(schema.clonedVoices.createdAt));
      ownClones = rows;
    } catch (e: any) {
      if (e?.code === "42P01" || /does not exist/i.test(e?.message || "")) {
        log.warn(
          "wireline_cloned_voices table missing - apply the checked cloned-voices migration",
        );
      } else {
        throw e;
      }
    }

    let catalog: ElevenLabsVoice[] = [];
    if (elevenLabsConfigured()) {
      try {
        catalog = await elListVoices();
      } catch (e) {
        if (e instanceof AppError) throw e;
        log.warn("ElevenLabs listVoices failed — returning empty catalog", {
          error: getErrorMessage(e),
        });
      }
    }

    const ownVoiceIds = new Set(ownClones.map((c) => c.voiceId));
    const merged = [
      ...ownClones.map((c) => ({
        voice_id: c.voiceId,
        name: c.name,
        category: "cloned" as const,
        preview_url: c.previewUrl,
        owned_by_user: true,
      })),
      ...catalog
        .filter((v) => !ownVoiceIds.has(v.voice_id))
        .filter((v) => v.category !== "cloned")
        .map((v) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category || "premade",
          preview_url: v.preview_url || null,
          owned_by_user: false,
        })),
    ];

    const presenterVoices = presenterVoicesConfigured()
      ? await listPresenterVoices().catch((e) => {
          log.warn("HeyGen listPresenterVoices failed — skipping presenter catalog", {
            error: getErrorMessage(e),
          });
          return [];
        })
      : [];

    res.json({
      voices: merged,
      presenterVoices: presenterVoices.map((voice) => ({
        voice_id: voice.id,
        name: voice.name,
        provider: "presenter",
        preview_url: voice.preview_audio_url ?? null,
        language: voice.language ?? null,
        gender: voice.gender ?? null,
      })),
      configured: elevenLabsConfigured(),
      providers: {
        elevenlabs: elevenLabsConfigured(),
        wirelineLive: Boolean(process.env.XAI_API_KEY?.trim()),
        vapi: Boolean(process.env.VAPI_PRIVATE_KEY?.trim()),
        presenter: presenterVoicesConfigured(),
      },
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.error("/api/voices GET failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Failed to list voices");
  }
});

// GET /api/voices/curated/preview — Wireline Live + Phone timbre samples (MP3 stream).
router.get(
  "/api/voices/curated/preview",
  curatedPreviewRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const provider = String(req.query.provider || "")
        .trim()
        .toLowerCase();
      const voiceId = String(req.query.voiceId || req.query.id || "").trim();
      if (!isCuratedPreviewProvider(provider) || !voiceId) {
        throw AppError.fromHttpStatus(400, "provider and voiceId are required.");
      }
      const audio = await generateCuratedVoicePreview(provider, voiceId);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(audio));
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("curated voice preview failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Preview failed");
    }
  },
);

// GET /api/voices/presenter/:id/preview — HeyGen presenter voice sample (redirect).
router.get("/api/voices/presenter/:id/preview", async (req: Request, res: Response) => {
  try {
    if (!presenterVoicesConfigured()) {
      throw AppError.fromHttpStatus(503, "Presenter voice previews unavailable.");
    }
    const voice = await getPresenterVoice(req.params.id);
    const previewUrl = voice?.preview_audio_url?.trim();
    if (!previewUrl) {
      throw AppError.fromHttpStatus(404, "No preview available for this presenter voice.");
    }
    res.redirect(302, assertTrustedHeyGenMediaUrl(previewUrl));
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.error("presenter voice preview failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Preview failed");
  }
});

// GET /api/voices/:id/preview — public preview for vendor-designated premade voices only.
router.get("/api/voices/:id/preview", async (req: Request, res: Response) => {
  try {
    const voiceId = req.params.id;
    if (!elevenLabsConfigured()) {
      throw AppError.fromHttpStatus(503, "Voice previews unavailable.");
    }
    try {
      const { getVoice } = await import("../lib/elevenlabs-client");
      const voice = await getVoice(voiceId);
      if (voice.category !== "premade") {
        throw AppError.fromHttpStatus(404, "Voice not found.");
      }
      const previewUrl = voice.preview_url ?? null;
      if (!previewUrl) {
        throw AppError.fromHttpStatus(404, "No preview available for this voice.");
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.redirect(302, previewUrl);
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.warn("voice preview lookup failed", { error: getErrorMessage(e), voiceId });
      throw AppError.fromHttpStatus(404, "Voice not found.");
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.error("voice preview failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Preview failed");
  }
});

// POST /api/voices/clone — instant clone from one explicitly authorized audio sample.
router.post(
  "/api/voices/clone",
  authenticateUser,
  cloneRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!elevenLabsConfigured()) {
        return res.status(503).json({
          code: "SERVICE_UNAVAILABLE",
          error: "Voice creation is not configured for this workspace.",
        });
      }

      const { name, audioBase64, audioMimeType, consent_given, consent_basis } = req.body ?? {};
      if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
        throw AppError.fromHttpStatus(400, "Voice name must be 2–80 characters.");
      }
      if (consent_given !== true || !isVoiceConsentBasis(consent_basis)) {
        return res.status(400).json({
          code: "VOICE_CONSENT_REQUIRED",
          error: "Select who owns the voice and confirm you are authorized to create it.",
        });
      }

      const sample = decodeVoiceSample(audioBase64, audioMimeType);
      const consentEvidenceId = randomUUID();
      const sampleSha256 = createHash("sha256").update(sample.bytes).digest("hex");
      const consentAudit = await recordVoiceAudit(req, "voice_clone_consent_attested", {
        evidence_id: consentEvidenceId,
        consent_version: VOICE_CONSENT_VERSION,
        consent_basis,
        attestation: "authorized_voice_use",
        provider: "elevenlabs",
        original_mime_type: sample.mimeType,
        sample_size_bytes: sample.bytes.length,
        sample_sha256: sampleSha256,
      });
      if (!consentAudit.success) {
        log.error("voice clone consent audit unavailable", {
          userId: req.user.id,
          evidenceId: consentEvidenceId,
          error: consentAudit.error,
        });
        return res.status(503).json({
          code: "VOICE_CONSENT_AUDIT_UNAVAILABLE",
          error: "Voice creation is temporarily unavailable because consent evidence could not be recorded.",
        });
      }

      let cloneAudioBase64 = sample.base64;
      let cloneMimeType = sample.mimeType;
      if (req.body?.skip_isolation !== true) {
        try {
          const isolated = await isolateVoice(sample.base64, sample.mimeType);
          cloneAudioBase64 = Buffer.from(isolated).toString("base64");
          cloneMimeType = "audio/mpeg";
          log.info("voice clone — isolation succeeded", {
            userId: req.user.id,
            in_size: sample.bytes.length,
            out_size: isolated.byteLength,
          });
        } catch (e) {
          if (e instanceof AppError) throw e;
          log.warn("voice isolation failed — proceeding with raw audio", {
            error: getErrorMessage(e),
          });
        }
      }

      const cloned = await createInstantClone({
        name: name.trim(),
        audioBase64: cloneAudioBase64,
        audioMimeType: cloneMimeType,
        description: `Wireline consent evidence ${consentEvidenceId}`,
      });

      try {
        await drizzle
          .insert(schema.clonedVoices)
          .values({
            voiceId: cloned.voice_id,
            userId: req.user.id,
            name: name.trim(),
            status: "completed",
            previewUrl: cloned.preview_url ?? null,
          })
          .onConflictDoNothing();
      } catch (databaseError) {
        try {
          await elDeleteVoice(cloned.voice_id);
        } catch (cleanupError) {
          log.error("voice clone compensation failed", {
            voiceId: cloned.voice_id,
            databaseError: getErrorMessage(databaseError),
            cleanupError: getErrorMessage(cleanupError),
          });
        }
        throw databaseError;
      }

      const createdAudit = await recordVoiceAudit(req, "voice_clone_created", {
        evidence_id: consentEvidenceId,
        consent_version: VOICE_CONSENT_VERSION,
        consent_basis,
        provider: "elevenlabs",
        voice_id: cloned.voice_id,
      });
      if (!createdAudit.success) {
        log.error("voice clone creation audit failed after consent was preserved", {
          userId: req.user.id,
          voiceId: cloned.voice_id,
          evidenceId: consentEvidenceId,
          error: createdAudit.error,
        });
      }

      log.info("voice cloned", {
        userId: req.user.id,
        voiceId: cloned.voice_id,
        evidenceId: consentEvidenceId,
      });
      res.json({
        voice: {
          voice_id: cloned.voice_id,
          name: name.trim(),
          preview_url: cloned.preview_url ?? null,
          owned_by_user: true,
        },
        consent_evidence_id: consentEvidenceId,
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("voice clone failed", { error: getErrorMessage(e), userId: req.user.id });
      res.status(500).json({
        code: "VOICE_CLONE_FAILED",
        error: "Voice creation failed. Try again or contact support if the problem continues.",
      });
    }
  },
);

// DELETE /api/voices/:id — remove a cloned voice (tenant-scoped, provider-first).
router.delete(
  "/api/voices/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const voiceId = req.params.id;
      const [own] = await drizzle
        .select()
        .from(schema.clonedVoices)
        .where(
          and(
            eq(schema.clonedVoices.voiceId, voiceId),
            eq(schema.clonedVoices.userId, req.user.id),
          ),
        )
        .limit(1);
      if (!own) throw AppError.fromHttpStatus(404, "Voice not found in your library.");

      if (!elevenLabsConfigured()) {
        return res.status(503).json({
          code: "VOICE_PROVIDER_UNAVAILABLE",
          error: "Voice deletion is temporarily unavailable. The voice remains tracked and can be retried safely.",
        });
      }

      try {
        await elDeleteVoice(voiceId);
      } catch (e) {
        log.error("voice provider delete failed — retaining local ownership record", {
          userId: req.user.id,
          voiceId,
          error: getErrorMessage(e),
        });
        await recordVoiceAudit(req, "voice_clone_delete_failed", {
          provider: "elevenlabs",
          voice_id: voiceId,
          provider_error: getErrorMessage(e).slice(0, 500),
        });
        return res.status(502).json({
          code: "VOICE_PROVIDER_DELETE_FAILED",
          error: "The provider did not confirm deletion. Wireline kept the voice record so deletion can be retried safely.",
        });
      }

      await drizzle
        .delete(schema.clonedVoices)
        .where(
          and(
            eq(schema.clonedVoices.voiceId, voiceId),
            eq(schema.clonedVoices.userId, req.user.id),
          ),
        );

      const deletedAudit = await recordVoiceAudit(req, "voice_clone_deleted", {
        provider: "elevenlabs",
        voice_id: voiceId,
      });
      if (!deletedAudit.success) {
        log.error("voice clone deletion audit failed", {
          userId: req.user.id,
          voiceId,
          error: deletedAudit.error,
        });
      }

      res.json({ ok: true });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("voice delete failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Delete failed");
    }
  },
);

export default router;
