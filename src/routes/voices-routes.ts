import { createHash, randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { and, desc, eq, gte, lte, notInArray, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError, asyncHandler } from "../lib/api-error";
import {
  createInstantVoiceClone,
  deleteElevenLabsVoice,
  elevenLabsConfigured,
  generateElevenLabsProof,
} from "../lib/elevenlabs-client";
import {
  ELEVENLABS_REALTIME_MODEL,
  ELEVENLABS_VOICE_CONSENT_VERSION,
  ELEVENLABS_VOICE_QUALITY_VERSION,
  isCuratedElevenLabsVoiceId,
} from "../lib/managed-voice-runtime";
import { ELEVENLABS_CURATED_VOICES } from "../lib/voice-catalog";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { createIpRateLimiter, createRateLimiter } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { isPlatformAdmin, requirePlatformAdmin } from "../middleware/platform-admin";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const CLONE_WINDOW_MS = 24 * 60 * 60_000;
const MAX_CLONE_REQUESTS_PER_WINDOW = 5;
const CREATING_RESERVATION_TTL_MS = 60 * 60_000;
// 3 MiB expands to about 4 MiB as base64, leaving room below Vercel's body ceiling.
const MAX_CLONE_AUDIO_BYTES = 3 * 1024 * 1024;
const MIN_CLONE_AUDIO_BYTES = 32 * 1024;
const MIN_CLONE_DURATION_SECONDS = 10;
const MAX_CLONE_DURATION_SECONDS = 90;
const CLONE_SCOPE = "wireline-agents";

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

const cloneIpRateLimit = createIpRateLimiter({
  bucket: "api:voice-clone",
  windowMs: CLONE_WINDOW_MS,
  max: 20,
  message: { error: "Voice creation limit reached. Try again tomorrow." },
});

const voicePreviewRateLimit = createRateLimiter({
  // Distinct from grok-voice-routes' "api:voice-preview". rateLimit() keys on
  // the bucket name, so sharing it made two endpoints increment one counter
  // that was then compared against two different ceilings. Both preview paths
  // now fail closed; they still keep separate buckets so one surface cannot
  // spend the other's vendor budget.
  bucket: "api:voice-preview-managed",
  windowMs: 60_000,
  max: 12,
  failClosedOnError: true,
});

const voiceMutationRateLimit = createRateLimiter({
  bucket: "api:voice-mutation",
  windowMs: 15 * 60_000,
  max: 30,
  failClosedOnError: true,
});

function normalizeMimeType(value: unknown): string {
  const normalized =
    typeof value === "string" ? value.split(";")[0]?.trim().toLowerCase() || "" : "";
  if (!ALLOWED_CLONE_AUDIO_MIME_TYPES.has(normalized)) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Use MP3, WAV, M4A, OGG, or WebM audio.");
  }
  return normalized;
}

function decodeAudio(value: unknown): Buffer {
  if (typeof value !== "string") throw AppError.badRequest("Audio sample required.");
  const base64 = value.replace(/\s/g, "");
  if (base64.length < 4 || base64.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw AppError.badRequest("Audio sample is not valid base64.");
  }
  const bytes = Buffer.from(base64, "base64");
  const canonicalInput = base64.replace(/=+$/, "");
  if (bytes.toString("base64").replace(/=+$/, "") !== canonicalInput) {
    throw AppError.badRequest("Audio sample is not valid base64.");
  }
  if (bytes.length < MIN_CLONE_AUDIO_BYTES) {
    throw AppError.badRequest("Audio sample is too short.");
  }
  if (bytes.length > MAX_CLONE_AUDIO_BYTES) {
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Audio sample too large (max 3 MB).");
  }
  return bytes;
}

function validateAudioSignature(bytes: Buffer, mimeType: string): void {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("ascii");
  const isWav = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
  const isMp3 =
    ascii(0, 3) === "ID3" || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  const isM4a = bytes.length >= 12 && ascii(4, 8) === "ftyp";
  const isOgg = ascii(0, 4) === "OggS";
  const isWebm =
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;
  const valid = mimeType.includes("wav")
    ? isWav
    : mimeType.includes("mpeg") || mimeType.includes("mp3")
      ? isMp3
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? isM4a
        : mimeType.includes("ogg")
          ? isOgg
          : mimeType.includes("webm")
            ? isWebm
            : false;
  if (!valid) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "The file does not match its audio type.");
  }
}

function normalizeDuration(value: unknown): number {
  const duration = Number(value);
  if (
    !Number.isFinite(duration) ||
    duration < MIN_CLONE_DURATION_SECONDS ||
    duration > MAX_CLONE_DURATION_SECONDS
  ) {
    throw AppError.badRequest("Use a 10 to 90 second single-speaker sample.");
  }
  return Math.round(duration);
}

function cleanVoiceName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 2 || name.length > 80) {
    throw AppError.badRequest("Voice name must be 2 to 80 characters.");
  }
  return name;
}

async function reserveCloneRequest(args: {
  req: AuthenticatedRequest;
  name: string;
  sourceSha256: string;
  sourceMimeType: string;
  sourceDurationSeconds: number;
  cleanupRequested: boolean;
}): Promise<string> {
  const windowStart = new Date(Date.now() - CLONE_WINDOW_MS);
  const reservationVoiceId = `creating:${randomUUID()}`;
  const metadata = {
    voiceName: args.name,
    sourceSha256: args.sourceSha256,
    sourceMimeType: args.sourceMimeType,
    sourceDurationSeconds: args.sourceDurationSeconds,
    intendedUse: CLONE_SCOPE,
    consentVersion: ELEVENLABS_VOICE_CONSENT_VERSION,
    sourceAudioRetained: false,
    cleanupRequested: args.cleanupRequested,
  };

  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`wireline:voice-clone:${args.req.user.id}`}))`,
    );

    // A serverless timeout can strand a pre-spend reservation. Expire only
    // reservations older than an hour; if the original request later resumes,
    // its conditional finalize fails and compensates by deleting the provider
    // voice instead of creating an unowned asset.
    const staleReservationCutoff = new Date(Date.now() - CREATING_RESERVATION_TTL_MS);
    await tx
      .update(schema.clonedVoices)
      .set({
        status: "failed",
        rejectionReason: "reservation_expired",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.clonedVoices.userId, args.req.user.id),
          eq(schema.clonedVoices.status, "creating"),
          lte(schema.clonedVoices.updatedAt, staleReservationCutoff),
        ),
      );

    const recent = await tx
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
    if (recent.length >= MAX_CLONE_REQUESTS_PER_WINDOW) {
      throw AppError.tooManyRequests("Voice creation limit reached. Try again tomorrow.");
    }

    const [duplicate] = await tx
      .select({ voiceId: schema.clonedVoices.voiceId })
      .from(schema.clonedVoices)
      .where(
        and(
          eq(schema.clonedVoices.userId, args.req.user.id),
          eq(schema.clonedVoices.sourceSha256, args.sourceSha256),
          notInArray(schema.clonedVoices.status, ["revoked", "failed"]),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw AppError.conflict("This sample already has a private voice.");
    }

    await tx.insert(schema.clonedVoices).values({
      voiceId: reservationVoiceId,
      userId: args.req.user.id,
      name: args.name,
      status: "creating",
      consentVersion: ELEVENLABS_VOICE_CONSENT_VERSION,
      sourceSha256: args.sourceSha256,
      sourceMimeType: args.sourceMimeType,
      sourceDurationSeconds: args.sourceDurationSeconds,
      intendedUse: CLONE_SCOPE,
      sourceAudioRetained: false,
      isolationApplied: args.cleanupRequested,
    });
    await tx.insert(schema.consentLog).values({
      userId: args.req.user.id,
      event: "voice.clone.consent_granted",
      ruleVersion: ELEVENLABS_VOICE_CONSENT_VERSION,
      rule: "speaker_is_requester_or_requester_has_documented_authorization",
      state: "granted",
      metadata,
    });
    await tx.insert(schema.auditLog).values({
      userId: args.req.user.id,
      action: "voice.clone.requested",
      provider: "elevenlabs",
      model: ELEVENLABS_REALTIME_MODEL,
      eventType: "voice.clone.requested",
      severity: "info",
      resourceType: "voice",
      ipAddress: args.req.ip || null,
      userAgent: args.req.get("user-agent") || null,
      metadata,
    });
  });
  return reservationVoiceId;
}

async function recordOutcome(args: {
  userId: string;
  action: string;
  voiceId?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await drizzle.insert(schema.auditLog).values({
      userId: args.userId,
      action: args.action,
      provider: "elevenlabs",
      model: ELEVENLABS_REALTIME_MODEL,
      eventType: args.action,
      severity: args.severity || "info",
      resourceType: "voice",
      resourceId: args.voiceId,
      metadata: args.metadata || {},
    });
  } catch (error) {
    log.error("voice lifecycle audit failed", {
      userId: args.userId,
      action: args.action,
      error: getErrorMessage(error),
    });
  }
}

router.get(
  "/api/voices",
  authenticateUser,
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const canManageVoices = await isPlatformAdmin(req.user).catch((error) => {
      log.warn("voice library admin lookup failed", {
        error: getErrorMessage(error),
      });
      return false;
    });
    const privateRows = await drizzle
      .select({
        voiceId: schema.clonedVoices.voiceId,
        name: schema.clonedVoices.name,
        status: schema.clonedVoices.status,
        previewUrl: schema.clonedVoices.previewUrl,
        providerVerificationRequired: schema.clonedVoices.providerVerificationRequired,
        createdAt: schema.clonedVoices.createdAt,
      })
      .from(schema.clonedVoices)
      .where(
        and(
          eq(schema.clonedVoices.userId, req.user.id),
          notInArray(schema.clonedVoices.status, ["creating", "failed"]),
        ),
      )
      .orderBy(desc(schema.clonedVoices.createdAt));

    const approvedPrivateVoices = privateRows
      .filter((voice) => voice.status === "approved")
      .map((voice) => ({
        voice_id: voice.voiceId,
        id: voice.voiceId,
        name: voice.name,
        provider: "11labs",
        category: "cloned",
        preview_url: `/api/voices/${encodeURIComponent(voice.voiceId)}/preview`,
        owned_by_user: true,
      }));

    res.json({
      configured: elevenLabsConfigured(),
      canManageVoices,
      voices: [
        ...ELEVENLABS_CURATED_VOICES.map((voice) => ({
          voice_id: voice.id,
          id: voice.id,
          name: voice.name,
          provider: voice.provider,
          category: "premade",
          preview_url: `/api/voices/${encodeURIComponent(voice.id)}/preview`,
          owned_by_user: false,
          gender: voice.gender,
        })),
        ...approvedPrivateVoices,
      ],
      privateVoices: canManageVoices
        ? privateRows.map((voice) => ({
            voice_id: voice.voiceId,
            name: voice.name,
            status: voice.status,
            preview_url: `/api/voices/${encodeURIComponent(voice.voiceId)}/preview`,
            provider_verification_required: voice.providerVerificationRequired,
            created_at: voice.createdAt,
          }))
        : [],
    });
  }),
);

router.get(
  "/api/voices/:id/preview",
  authenticateUser,
  voicePreviewRateLimit,
  enforceLaunchHardGate,
  asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const voiceId = req.params.id.trim();
    const curated = isCuratedElevenLabsVoiceId(voiceId);
    if (!curated) {
      if (!(await isPlatformAdmin(req.user))) {
        throw AppError.notFound("Voice not found.");
      }
      const [owned] = await drizzle
        .select({ status: schema.clonedVoices.status })
        .from(schema.clonedVoices)
        .where(
          and(
            eq(schema.clonedVoices.voiceId, voiceId),
            eq(schema.clonedVoices.userId, req.user.id),
          ),
        )
        .limit(1);
      if (!owned || ["revoked", "failed", "deletion_pending"].includes(owned.status)) {
        throw AppError.notFound("Voice not found.");
      }
    }

    try {
      const proof = await generateElevenLabsProof({ voiceId });
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", curated ? "private, max-age=3600" : "private, no-store");
      res.send(Buffer.from(proof));
    } catch (error) {
      log.warn("voice quality preview failed", {
        userId: req.user.id,
        voiceId,
        error: getErrorMessage(error),
      });
      throw AppError.serviceUnavailable("Voice preview is temporarily unavailable.");
    }
  }),
);

router.post(
  "/api/voices/clone",
  authenticateUser,
  requirePlatformAdmin,
  voiceMutationRateLimit,
  cloneIpRateLimit,
  enforceLaunchHardGate,
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    if (!elevenLabsConfigured()) {
      throw AppError.serviceUnavailable("Voice creation is not configured.");
    }
    if (req.body?.consentAccepted !== true) {
      throw AppError.badRequest("Speaker authorization is required.");
    }
    if (req.body?.consentVersion !== ELEVENLABS_VOICE_CONSENT_VERSION) {
      throw AppError.badRequest("Voice authorization changed. Refresh and confirm it again.");
    }

    const name = cleanVoiceName(req.body?.name);
    const audioMimeType = normalizeMimeType(req.body?.audioMimeType);
    const audioBytes = decodeAudio(req.body?.audioBase64);
    validateAudioSignature(audioBytes, audioMimeType);
    const sourceDurationSeconds = normalizeDuration(req.body?.sourceDurationSeconds);
    const removeBackgroundNoise = req.body?.removeBackgroundNoise === true;
    const sourceSha256 = createHash("sha256").update(audioBytes).digest("hex");

    const reservationVoiceId = await reserveCloneRequest({
      req,
      name,
      sourceSha256,
      sourceMimeType: audioMimeType,
      sourceDurationSeconds,
      cleanupRequested: removeBackgroundNoise,
    });

    let providerVoiceId: string | undefined;
    try {
      const created = await createInstantVoiceClone({
        name,
        audioBytes,
        audioMimeType,
        removeBackgroundNoise,
      });
      providerVoiceId = created.voiceId;

      const inserted = await drizzle
        .update(schema.clonedVoices)
        .set({
          voiceId: created.voiceId,
          status: "pending_review",
          previewUrl: created.previewUrl,
          providerVerificationRequired: created.requiresVerification,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.clonedVoices.voiceId, reservationVoiceId),
            eq(schema.clonedVoices.userId, req.user.id),
            eq(schema.clonedVoices.status, "creating"),
          ),
        )
        .returning({ voiceId: schema.clonedVoices.voiceId });
      if (inserted.length !== 1) {
        throw new Error("Voice ownership could not be persisted.");
      }

      await recordOutcome({
        userId: req.user.id,
        action: "voice.clone.pending_review",
        voiceId: created.voiceId,
        metadata: {
          consentVersion: ELEVENLABS_VOICE_CONSENT_VERSION,
          sourceAudioRetained: false,
          qualityGateRequired: true,
        },
      });
      res.status(201).json({
        voice: {
          voice_id: created.voiceId,
          name,
          status: "pending_review",
          consent_recorded: true,
        },
      });
    } catch (error) {
      let providerDeletionConfirmed = !providerVoiceId;
      if (providerVoiceId) {
        try {
          await deleteElevenLabsVoice(providerVoiceId);
          providerDeletionConfirmed = true;
        } catch (cleanupError) {
          log.error("voice clone compensation delete failed", {
            userId: req.user.id,
            voiceId: providerVoiceId,
            error: getErrorMessage(cleanupError),
          });
        }
      }
      try {
        await drizzle
          .update(schema.clonedVoices)
          .set({
            ...(providerVoiceId && !providerDeletionConfirmed
              ? { voiceId: providerVoiceId, status: "deletion_pending" }
              : { status: "failed" }),
            rejectionReason:
              providerVoiceId && !providerDeletionConfirmed
                ? "provider_cleanup_pending"
                : "clone_creation_failed",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.clonedVoices.userId, req.user.id),
              providerVoiceId
                ? or(
                    eq(schema.clonedVoices.voiceId, reservationVoiceId),
                    eq(schema.clonedVoices.voiceId, providerVoiceId),
                  )
                : eq(schema.clonedVoices.voiceId, reservationVoiceId),
            ),
          );
      } catch (reservationError) {
        log.error("voice clone reservation recovery failed", {
          userId: req.user.id,
          voiceId: providerVoiceId,
          error: getErrorMessage(reservationError),
        });
      }
      await recordOutcome({
        userId: req.user.id,
        action: "voice.clone.failed",
        voiceId: providerVoiceId,
        severity: "error",
        metadata: {
          errorClass: error instanceof Error ? error.name : "UnknownError",
        },
      });
      log.error("voice clone failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      if (error instanceof AppError) throw error;
      throw AppError.internal("Voice creation failed. Try again or contact support.");
    }
  }),
);

router.post(
  "/api/voices/:id/approve",
  authenticateUser,
  requirePlatformAdmin,
  voiceMutationRateLimit,
  enforceLaunchHardGate,
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    if (req.body?.qualityConfirmed !== true) {
      throw AppError.badRequest("Listen to the proof and confirm its quality first.");
    }
    if (req.body?.qualityVersion !== ELEVENLABS_VOICE_QUALITY_VERSION) {
      throw AppError.badRequest("The quality checklist changed. Refresh and review again.");
    }
    const voiceId = req.params.id.trim();
    const [voice] = await drizzle
      .select({
        status: schema.clonedVoices.status,
        providerVerificationRequired: schema.clonedVoices.providerVerificationRequired,
      })
      .from(schema.clonedVoices)
      .where(
        and(eq(schema.clonedVoices.voiceId, voiceId), eq(schema.clonedVoices.userId, req.user.id)),
      )
      .limit(1);
    if (!voice) throw AppError.notFound("Voice not found.");
    if (voice.status === "approved") {
      res.json({ ok: true, status: "approved" });
      return;
    }
    if (voice.status !== "pending_review") {
      throw AppError.conflict("Only a pending voice can be approved.");
    }
    if (voice.providerVerificationRequired) {
      throw AppError.conflict("Provider verification is required before this voice can go live.");
    }

    try {
      // A fresh proof render verifies provider access, the selected low-latency
      // model, and usable audio immediately before the live gate opens.
      await generateElevenLabsProof({ voiceId });
    } catch (error) {
      log.warn("voice approval proof failed", {
        userId: req.user.id,
        voiceId,
        error: getErrorMessage(error),
      });
      throw AppError.serviceUnavailable("Quality proof failed. The voice remains private.");
    }

    const approvedAt = new Date();
    await drizzle.transaction(async (tx) => {
      const approved = await tx
        .update(schema.clonedVoices)
        .set({
          status: "approved",
          qualityCheckVersion: ELEVENLABS_VOICE_QUALITY_VERSION,
          qualitySampleModel: ELEVENLABS_REALTIME_MODEL,
          approvedAt,
          approvedBy: req.user.id,
          rejectionReason: null,
          updatedAt: approvedAt,
        })
        .where(
          and(
            eq(schema.clonedVoices.voiceId, voiceId),
            eq(schema.clonedVoices.userId, req.user.id),
            eq(schema.clonedVoices.status, "pending_review"),
          ),
        )
        .returning({ voiceId: schema.clonedVoices.voiceId });
      if (approved.length !== 1) {
        throw AppError.conflict("Voice review changed. Refresh and try again.");
      }
      await tx.insert(schema.auditLog).values({
        userId: req.user.id,
        action: "voice.clone.approved",
        provider: "elevenlabs",
        model: ELEVENLABS_REALTIME_MODEL,
        eventType: "voice.clone.approved",
        severity: "info",
        resourceType: "voice",
        resourceId: voiceId,
        metadata: { qualityVersion: ELEVENLABS_VOICE_QUALITY_VERSION },
      });
    });
    res.json({ ok: true, status: "approved" });
  }),
);

router.delete(
  "/api/voices/:id",
  authenticateUser,
  requirePlatformAdmin,
  voiceMutationRateLimit,
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const voiceId = req.params.id.trim();
    const [voice] = await drizzle
      .select({
        voiceId: schema.clonedVoices.voiceId,
        status: schema.clonedVoices.status,
      })
      .from(schema.clonedVoices)
      .where(
        and(eq(schema.clonedVoices.voiceId, voiceId), eq(schema.clonedVoices.userId, req.user.id)),
      )
      .limit(1);
    if (!voice) throw AppError.notFound("Voice not found.");

    if (voice.status !== "deletion_pending") {
      const now = new Date();
      await drizzle.transaction(async (tx) => {
        await tx
          .update(schema.clonedVoices)
          .set({ status: "deletion_pending", updatedAt: now })
          .where(
            and(
              eq(schema.clonedVoices.voiceId, voiceId),
              eq(schema.clonedVoices.userId, req.user.id),
            ),
          );
        await tx
          .update(schema.agents)
          .set({
            voiceProvider: "vapi",
            voiceId: "Savannah",
            voiceIdInbound: null,
            voiceIdOutbound: null,
          })
          .where(
            and(
              eq(schema.agents.userId, req.user.id),
              or(
                eq(schema.agents.voiceId, voiceId),
                eq(schema.agents.voiceIdInbound, voiceId),
                eq(schema.agents.voiceIdOutbound, voiceId),
              ),
            ),
          );
        await tx.insert(schema.consentLog).values({
          userId: req.user.id,
          event: "voice.clone.consent_withdrawn",
          ruleVersion: ELEVENLABS_VOICE_CONSENT_VERSION,
          rule: "speaker_authorization_withdrawn",
          state: "withdrawn",
          metadata: { voiceId, liveUseDisabledImmediately: true },
        });
        await tx.insert(schema.auditLog).values({
          userId: req.user.id,
          action: "voice.clone.revoked",
          provider: "elevenlabs",
          eventType: "voice.clone.revoked",
          severity: "warning",
          resourceType: "voice",
          resourceId: voiceId,
          metadata: { liveUseDisabledImmediately: true },
        });
      });
    }

    try {
      await deleteElevenLabsVoice(voiceId);
    } catch (error) {
      log.error("provider voice deletion pending", {
        userId: req.user.id,
        voiceId,
        error: getErrorMessage(error),
      });
      res.status(202).json({ ok: false, status: "deletion_pending" });
      return;
    }

    await drizzle
      .delete(schema.clonedVoices)
      .where(
        and(eq(schema.clonedVoices.voiceId, voiceId), eq(schema.clonedVoices.userId, req.user.id)),
      );
    await recordOutcome({
      userId: req.user.id,
      action: "voice.clone.deleted",
      voiceId,
      metadata: { providerDeletionConfirmed: true },
    });
    res.json({ ok: true, status: "deleted" });
  }),
);

export default router;
