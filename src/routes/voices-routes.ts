import { createHash } from "node:crypto";
import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * /api/voices — voice catalog + cloning surface.
 *
 * GET    /api/voices                   — list catalog + this user's clones
 * GET    /api/voices/:id/preview       — public preview for premade voices only
 * POST   /api/voices/clone             — instant clone from audio sample
 * DELETE /api/voices/:id               — remove a cloned voice
 *
 * Cost discipline: clone requests are protected by both an IP limiter and
 * a durable, user-scoped 24-hour quota recorded in the audit ledger. The
 * durable ledger survives serverless instance churn and prevents simple
 * create/delete loops from resetting the allowance.
 *
 * Privacy: cloning requires an explicit speaker-authorization attestation.
 * Wireline records the consent policy version, source-audio fingerprint,
 * intended use, request metadata, and provider outcome without retaining
 * the uploaded source sample.
 */
import { Router, type Request, type Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { log, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";
import {
  listVoices as elListVoices,
  createInstantClone,
  deleteVoice as elDeleteVoice,
  getVoice,
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

const CLONE_WINDOW_MS = 24 * 60 * 60_000;
const MAX_CLONE_REQUESTS_PER_WINDOW = 5;
// 3 MiB expands to ~4 MiB as base64, leaving headroom under Vercel's 4.5 MB request cap.
const MAX_CLONE_AUDIO_BYTES = 3 * 1024 * 1024;
const MIN_CLONE_AUDIO_BYTES = 1024;
const VOICE_CLONE_CONSENT_VERSION = "voice-clone-consent-v2-2026-07-11";
const VOICE_CLONE_DEFAULT_SCOPE = "wireline-agents";

const ALLOWED_CLONE_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
]);

/**
 * Defense in depth for infrastructure abuse. The durable per-user quota below
 * is the source of truth for authenticated clone spend.
 */
const cloneRateLimiter = createIpRateLimiter({
  bucket: "api:voice-clone",
  windowMs: CLONE_WINDOW_MS,
  max: 20,
  message: { error: "Too many voice-creation requests from this network. Try again tomorrow." },
});

/** Public curated previews call provider TTS — cap per IP to prevent abuse. */
const curatedPreviewRateLimiter = createIpRateLimiter({
  bucket: "api:voice-curated-preview",
  windowMs: 60_000,
  max: 30,
  message: { error: "Preview limit reached. Try again in a minute." },
});

/** Public premade catalog resolution also touches the provider API. */
const publicPreviewRateLimiter = createIpRateLimiter({
  bucket: "api:voice-public-preview",
  windowMs: 60_000,
  max: 60,
  message: { error: "Preview limit reached. Try again in a minute." },
});

function normalizeCloneMimeType(value: unknown): string {
  if (typeof value !== "string") {
    throw AppError.fromHttpStatus(400, "Audio type is required.");
  }
  const normalized = value.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_CLONE_AUDIO_MIME_TYPES.has(normalized)) {
    throw AppError.fromHttpStatus(
      415,
      "Unsupported audio type. Use MP3, WAV, M4A, OGG, or WebM.",
    );
  }
  return normalized;
}

function assertTrustedElevenLabsPreviewUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw AppError.fromHttpStatus(502, "Voice preview URL is invalid.");
  }

  const trustedHost =
    url.hostname === "storage.googleapis.com" || url.hostname.endsWith(".elevenlabs.io");
  if (url.protocol !== "https:" || !trustedHost) {
    throw AppError.fromHttpStatus(502, "Voice preview URL is not trusted.");
  }
  return url.toString();
}

function decodeCloneAudio(value: unknown): { bytes: Buffer; base64: string } {
  if (typeof value !== "string") {
    throw AppError.fromHttpStatus(400, "Audio sample required (30-90 seconds recommended).");
  }

  const base64 = value.replace(/\s/g, "");
  if (
    base64.length < 4 ||
    base64.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    throw AppError.fromHttpStatus(400, "Audio sample is not valid base64.");
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < MIN_CLONE_AUDIO_BYTES) {
    throw AppError.fromHttpStatus(400, "Audio sample is too short.");
  }
  if (bytes.length > MAX_CLONE_AUDIO_BYTES) {
    throw AppError.fromHttpStatus(413, "Audio sample too large (max 3 MB).");
  }

  return { bytes, base64 };
}

async function reserveVoiceCloneRequest(args: {
  req: AuthenticatedRequest;
  voiceName: string;
  sourceSha256: string;
  audioMimeType: string;
  intendedUse: string;
}): Promise<void> {
  const ipAddress = args.req.ip || null;
  const userAgent = args.req.get("user-agent") || null;
  const metadata = {
    voiceName: args.voiceName,
    sourceSha256: args.sourceSha256,
    audioMimeType: args.audioMimeType,
    intendedUse: args.intendedUse,
    consentVersion: VOICE_CLONE_CONSENT_VERSION,
    sourceAudioRetained: false,
  };
  const windowStart = new Date(Date.now() - CLONE_WINDOW_MS);

  await drizzle.transaction(async (tx) => {
    // Serialize quota reservations for this user across all serverless replicas.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`wireline:voice-clone:${args.req.user.id}`}))`,
    );

    const recentRequests = await tx
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, args.req.user.id),
          eq(schema.auditLog.eventType, "voice.clone.requested"),
          gte(schema.auditLog.createdAt, windowStart),
        ),
      )
      .limit(MAX_CLONE_REQUESTS_PER_WINDOW);

    if (recentRequests.length >= MAX_CLONE_REQUESTS_PER_WINDOW) {
      throw AppError.fromHttpStatus(429, "Clone limit reached. Try again tomorrow.");
    }

    await tx.insert(schema.consentLog).values({
      userId: args.req.user.id,
      event: "voice.clone.consent_granted",
      ruleVersion: VOICE_CLONE_CONSENT_VERSION,
      rule: "speaker_is_requester_or_requester_has_documented_authorization",
      state: "granted",
      metadata,
    });

    await tx.insert(schema.auditLog).values({
      userId: args.req.user.id,
      action: "voice.clone.requested",
      provider: "elevenlabs",
      eventType: "voice.clone.requested",
      severity: "info",
      resourceType: "voice",
      ipAddress,
      userAgent,
      metadata,
    });
  });
}

async function recordVoiceCloneOutcome(args: {
  userId: string;
  voiceId?: string;
  outcome: "completed" | "failed";
  errorClass?: string;
}): Promise<void> {
  try {
    await drizzle.insert(schema.auditLog).values({
      userId: args.userId,
      action: `voice.clone.${args.outcome}`,
      provider: "elevenlabs",
      eventType: `voice.clone.${args.outcome}`,
      severity: args.outcome === "completed" ? "info" : "error",
      resourceType: "voice",
      resourceId: args.voiceId,
      metadata: args.errorClass ? { errorClass: args.errorClass } : {},
    });
  } catch (auditError) {
    log.error("voice clone outcome audit failed", {
      userId: args.userId,
      outcome: args.outcome,
      error: getErrorMessage(auditError),
    });
  }
}

// GET /api/voices — merged tenant-private and public-premade catalog.
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
        .filter((v) => v.category === "premade")
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

// GET /api/voices/curated/preview — Wireline-curated provider samples.
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

// GET /api/voices/presenter/:id/preview — trusted presenter sample redirect.
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

// GET /api/voices/:id/preview — public provider-premade preview only.
router.get(
  "/api/voices/:id/preview",
  publicPreviewRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const voiceId = req.params.id;
      if (!elevenLabsConfigured()) {
        throw AppError.fromHttpStatus(503, "Voice previews unavailable.");
      }
      try {
        const voice = await getVoice(voiceId);
        if (voice.category !== "premade") {
          log.warn("blocked non-premade public voice preview", {
            voiceId,
            category: voice.category ?? "unknown",
          });
          throw AppError.fromHttpStatus(404, "Voice not found.");
        }

        const previewUrl = voice.preview_url ?? null;
        if (!previewUrl) {
          throw AppError.fromHttpStatus(404, "No preview available for this voice.");
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
        res.redirect(302, assertTrustedElevenLabsPreviewUrl(previewUrl));
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
  },
);

// POST /api/voices/clone — authorized instant clone from one audio sample.
router.post(
  "/api/voices/clone",
  authenticateUser,
  cloneRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    let cloneRequestReserved = false;
    try {
      if (!elevenLabsConfigured()) {
        return res.status(503).json({
          code: "SERVICE_UNAVAILABLE",
          error:
            "Voice cloning isn't configured. The owner needs to set ELEVENLABS_API_KEY in environment variables.",
        });
      }

      const {
        name,
        audioBase64,
        audioMimeType,
        consent_given,
        consent_statement_version,
        voice_use_scope,
      } = req.body ?? {};

      if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
        throw AppError.fromHttpStatus(400, "Voice name must be 2-80 characters.");
      }
      if (consent_given !== true) {
        return res.status(400).json({
          code: "BAD_REQUEST",
          error:
            "Consent required. Confirm you are the speaker or have documented authorization before submitting.",
        });
      }
      if (consent_statement_version !== VOICE_CLONE_CONSENT_VERSION) {
        throw AppError.fromHttpStatus(
          400,
          "Voice authorization statement is missing or out of date. Refresh and retry.",
        );
      }

      const cloneMimeType = normalizeCloneMimeType(audioMimeType);
      const decodedAudio = decodeCloneAudio(audioBase64);
      const voiceName = name.trim();
      const intendedUse =
        typeof voice_use_scope === "string" && voice_use_scope.trim()
          ? voice_use_scope.trim().slice(0, 120)
          : VOICE_CLONE_DEFAULT_SCOPE;
      const sourceSha256 = createHash("sha256").update(decodedAudio.bytes).digest("hex");

      await reserveVoiceCloneRequest({
        req,
        voiceName,
        sourceSha256,
        audioMimeType: cloneMimeType,
        intendedUse,
      });
      cloneRequestReserved = true;

      let providerAudioBase64 = decodedAudio.base64;
      let providerMimeType = cloneMimeType;
      if (req.body?.skip_isolation !== true) {
        try {
          const isolated = await isolateVoice(providerAudioBase64, providerMimeType);
          providerAudioBase64 = Buffer.from(isolated).toString("base64");
          providerMimeType = "audio/mpeg";
          log.info("voice clone — isolation succeeded", {
            userId: req.user.id,
            inputBytes: decodedAudio.bytes.length,
            outputBytes: Buffer.byteLength(providerAudioBase64, "base64"),
          });
        } catch (e) {
          log.warn("voice isolation failed — proceeding with validated source audio", {
            userId: req.user.id,
            error: getErrorMessage(e),
          });
        }
      }

      const cloned = await createInstantClone({
        name: voiceName,
        audioBase64: providerAudioBase64,
        audioMimeType: providerMimeType,
        description: "Private voice created through Wireline",
      });

      try {
        const inserted = await drizzle
          .insert(schema.clonedVoices)
          .values({
            voiceId: cloned.voice_id,
            userId: req.user.id,
            name: voiceName,
            status: "completed",
            previewUrl: cloned.preview_url ?? null,
          })
          .onConflictDoNothing()
          .returning({ voiceId: schema.clonedVoices.voiceId });

        if (inserted.length !== 1) {
          throw new Error("Cloned voice could not be assigned to the requesting tenant.");
        }
      } catch (persistenceError) {
        try {
          await elDeleteVoice(cloned.voice_id);
        } catch (cleanupError) {
          log.error("voice clone compensation delete failed", {
            userId: req.user.id,
            voiceId: cloned.voice_id,
            error: getErrorMessage(cleanupError),
          });
        }
        throw persistenceError;
      }

      await recordVoiceCloneOutcome({
        userId: req.user.id,
        voiceId: cloned.voice_id,
        outcome: "completed",
      });

      log.info("voice cloned", { userId: req.user.id, voiceId: cloned.voice_id });
      res.json({
        voice: {
          voice_id: cloned.voice_id,
          name: voiceName,
          preview_url: cloned.preview_url ?? null,
          owned_by_user: true,
          consent_recorded: true,
        },
      });
    } catch (e) {
      log.error("voice clone failed", {
        userId: req.user.id,
        error: getErrorMessage(e),
      });
      if (cloneRequestReserved) {
        await recordVoiceCloneOutcome({
          userId: req.user.id,
          outcome: "failed",
          errorClass: e instanceof Error ? e.name : "UnknownError",
        });
      }
      if (e instanceof AppError) throw e;
      res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "Voice creation failed. Try again or contact support.",
      });
    }
  },
);

// DELETE /api/voices/:id — tenant-owned cloned voice only.
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
        throw AppError.fromHttpStatus(
          503,
          "Voice deletion is temporarily unavailable. The voice remains private and owned by this workspace.",
        );
      }

      try {
        await elDeleteVoice(voiceId);
      } catch (e) {
        log.error("ElevenLabs delete failed — preserving local ownership for retry", {
          userId: req.user.id,
          voiceId,
          error: getErrorMessage(e),
        });
        await recordVoiceCloneOutcome({
          userId: req.user.id,
          voiceId,
          outcome: "failed",
          errorClass: "ProviderDeletionError",
        });
        throw AppError.fromHttpStatus(
          502,
          "Voice deletion is temporarily unavailable. The voice remains private and owned by this workspace.",
        );
      }

      await drizzle
        .delete(schema.clonedVoices)
        .where(
          and(
            eq(schema.clonedVoices.voiceId, voiceId),
            eq(schema.clonedVoices.userId, req.user.id),
          ),
        );

      try {
        await drizzle.insert(schema.auditLog).values({
          userId: req.user.id,
          action: "voice.clone.deleted",
          provider: "elevenlabs",
          eventType: "voice.clone.deleted",
          severity: "info",
          resourceType: "voice",
          resourceId: voiceId,
          metadata: { consentRevoked: true },
        });
      } catch (auditError) {
        log.error("voice deletion audit failed", {
          userId: req.user.id,
          voiceId,
          error: getErrorMessage(auditError),
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
