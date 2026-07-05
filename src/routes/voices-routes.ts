import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * /api/voices — voice catalog + cloning surface.
 *
 * GET    /api/voices                   — list catalog + this user's clones
 * GET    /api/voices/:id/preview       — proxy ElevenLabs preview MP3
 * POST   /api/voices/clone             — instant clone from audio sample
 * DELETE /api/voices/:id               — remove a cloned voice
 *
 * Cost discipline: instant cloning is ~$10/clone on ElevenLabs. We
 * rate-limit /clone to 5 per 24h per user via an in-memory bucket
 * (same pattern as the support ticket rate limiter) so a bot can't
 * drain the credit.
 *
 * Privacy: each clone uploads someone's voice sample. The /clone
 * route requires an explicit consent flag in the body
 * (`consent_given: true`) — Account Holder must confirm they have
 * permission to clone this voice. Logged for the record.
 */
import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
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
  isolateVoice,
  elevenLabsConfigured,
  type ElevenLabsVoice,
} from "../lib/elevenlabs-client";

const router = Router();

const cloneRateLimiter = createIpRateLimiter({
  bucket: "api:voice-clone",
  windowMs: 24 * 60 * 60_000, // 24h
  max: 5,
  message: { error: "Clone limit reached. Try again tomorrow." },
});

// GET /api/voices — merged catalog.
router.get("/api/voices", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Always include the user's own cloned voices from our DB
    // (single source of truth for "what this tenant owns").
    // Graceful fallback: if the table doesn't exist yet (migration
    // hasn't been run on this environment), treat as empty list so
    // the ElevenLabs catalog still loads.
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
      // 42P01 = undefined_table in Postgres. Surface a clear log line
      // so the Account Holder knows to run /api/admin/migrate-cloned-voices
      // but don't break the catalog response.
      if (e?.code === "42P01" || /does not exist/i.test(e?.message || "")) {
        log.warn("wireline_cloned_voices table missing — run migrate-cloned-voices");
      } else {
        throw e;
      }
    }

    // Hit ElevenLabs only if configured. If not, return the cloned
    // rows alone — UI gracefully shows just user's clones.
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

    // Merge: cloned voices come first, then premade catalog.
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
        .filter((v) => v.category !== "cloned") // cloned voices we don't own → hide
        .map((v) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category || "premade",
          preview_url: v.preview_url || null,
          owned_by_user: false,
        })),
    ];

    res.json({
      voices: merged,
      configured: elevenLabsConfigured(),
      providers: {
        elevenlabs: elevenLabsConfigured(),
        wirelineLive: Boolean(process.env.XAI_API_KEY?.trim()),
        vapi: Boolean(process.env.VAPI_API_KEY?.trim()),
      },
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    log.error("/api/voices GET failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Failed to list voices");
  }
});

// GET /api/voices/:id/preview — proxy the ElevenLabs preview MP3.
// PUBLIC (no auth) so the home-page hero widget + the public Showcase
// + the public Pricing page can all play voice samples without a
// session. The preview URLs are already public on ElevenLabs's CDN;
// we're just resolving voiceId → URL server-side to keep the API
// key + voice-id catalog one layer removed from browser code.
//
// Cloned-voice previews (per-tenant) are NOT exposed here — they
// require an authenticated session and live on the authed route
// below. This endpoint only returns previews for premade voices.
router.get("/api/voices/:id/preview", async (req: Request, res: Response) => {
  try {
    const voiceId = req.params.id;
    if (!elevenLabsConfigured()) {
      throw AppError.fromHttpStatus(503, "Voice previews unavailable.");
    }
    try {
      const { getVoice } = await import("../lib/elevenlabs-client");
      const v = await getVoice(voiceId);
      const previewUrl = v.preview_url ?? null;
      if (!previewUrl) {
        throw AppError.fromHttpStatus(404, "No preview available for this voice.");
      }
      // 302 redirect to the public preview URL — simpler than streaming
      // the MP3 through our server (saves bandwidth + cold-start cost).
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

// POST /api/voices/clone — instant clone from a single audio sample.
router.post(
  "/api/voices/clone",
  authenticateUser,
  cloneRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!elevenLabsConfigured()) {
        return res.status(503).json({
          code: "SERVICE_UNAVAILABLE",
          error:
            "Voice cloning isn't configured. The owner needs to set ELEVENLABS_API_KEY in environment variables.",
        });
      }
      const { name, audioBase64, audioMimeType, consent_given } = req.body ?? {};
      if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
        throw AppError.fromHttpStatus(400, "Voice name must be 2-80 characters.");
      }
      if (typeof audioBase64 !== "string" || audioBase64.length < 1000) {
        throw AppError.fromHttpStatus(400, "Audio sample required (≥30 sec recommended).");
      }
      // Hard size ceiling to avoid abuse — instant clones work great
      // on 30-90s samples (typical 1-5 MB) so 25MB is plenty of headroom.
      if (audioBase64.length > 35 * 1024 * 1024) {
        throw AppError.fromHttpStatus(413, "Audio sample too large (max ~25MB).");
      }
      if (consent_given !== true) {
        return res.status(400).json({
          code: "BAD_REQUEST",
          error:
            "Consent required. Confirm you have permission to clone this voice before submitting.",
        });
      }

      // Voice isolator pre-clean: strip background noise from the
      // sample before sending to the clone endpoint. Account Holders record
      // on phones with kids in the background; isolator gets us
      // studio-quality input from a real-world one. Optional via
      // `skip_isolation: true` in body (for ops who pre-cleaned
      // their audio themselves). Falls back gracefully — if isolation
      // fails, we use the original audio.
      let cloneAudioBase64 = audioBase64;
      let cloneMimeType: string | undefined =
        typeof audioMimeType === "string" ? audioMimeType : undefined;
      if (req.body?.skip_isolation !== true) {
        try {
          const isolated = await isolateVoice(audioBase64, cloneMimeType);
          cloneAudioBase64 = Buffer.from(isolated).toString("base64");
          cloneMimeType = "audio/mpeg"; // isolator returns MP3
          log.info("voice clone — isolation succeeded", {
            userId: req.user.id,
            in_size: audioBase64.length,
            out_size: cloneAudioBase64.length,
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
        description: `Cloned by Wireline tenant ${req.user.id} on ${new Date().toISOString()}`,
      });

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

      log.info("voice cloned", { userId: req.user.id, voiceId: cloned.voice_id });
      res.json({
        voice: {
          voice_id: cloned.voice_id,
          name: name.trim(),
          preview_url: cloned.preview_url ?? null,
          owned_by_user: true,
        },
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("voice clone failed", { error: getErrorMessage(e) });
      res.status(500).json({
        code: "INTERNAL_ERROR",
        error: getErrorMessage(e),
      });
    }
  },
);

// DELETE /api/voices/:id — remove a cloned voice (tenant-scoped).
router.delete(
  "/api/voices/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const voiceId = req.params.id;
      // Only allow deleting voices THIS tenant owns. Premade catalog
      // is read-only.
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

      if (elevenLabsConfigured()) {
        try {
          await elDeleteVoice(voiceId);
        } catch (e) {
          if (e instanceof AppError) throw e;
          log.warn("ElevenLabs delete failed — removing local row anyway", {
            voiceId,
            error: getErrorMessage(e),
          });
        }
      }
      await drizzle
        .delete(schema.clonedVoices)
        .where(
          and(
            eq(schema.clonedVoices.voiceId, voiceId),
            eq(schema.clonedVoices.userId, req.user.id),
          ),
        );

      res.json({ ok: true });
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("voice delete failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Delete failed");
    }
  },
);

export default router;
