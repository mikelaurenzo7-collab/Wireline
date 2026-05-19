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
 * (`consent_given: true`) — operator must confirm they have
 * permission to clone this voice. Logged for the record.
 */
import { Router, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import type { AuthenticatedRequest } from "../types/auth";
import { authenticateUser } from "../middleware/auth";
import { log, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";
import {
  listVoices as elListVoices,
  createInstantClone,
  deleteVoice as elDeleteVoice,
  elevenLabsConfigured,
  type ElevenLabsVoice,
} from "../lib/elevenlabs-client";

const router = Router();

const cloneRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60_000, // 24h
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Clone limit reached. Try again tomorrow." },
});

// GET /api/voices — merged catalog.
router.get("/api/voices", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Always include the user's own cloned voices from our DB
    // (single source of truth for "what this tenant owns").
    const ownClones = await drizzle
      .select()
      .from(schema.clonedVoices)
      .where(eq(schema.clonedVoices.userId, req.user.id))
      .orderBy(desc(schema.clonedVoices.createdAt));

    // Hit ElevenLabs only if configured. If not, return the cloned
    // rows alone — UI gracefully shows just user's clones.
    let catalog: ElevenLabsVoice[] = [];
    if (elevenLabsConfigured()) {
      try {
        catalog = await elListVoices();
      } catch (e) {
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

    res.json({ voices: merged, configured: elevenLabsConfigured() });
  } catch (e) {
    log.error("/api/voices GET failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to list voices" });
  }
});

// GET /api/voices/:id/preview — proxy the ElevenLabs preview MP3.
// Keeps the API key server-side, gives the browser a clean public URL.
router.get(
  "/api/voices/:id/preview",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const voiceId = req.params.id;
      // Resolve the preview URL — either from our cloned-voices table
      // (faster, cached) or from ElevenLabs in one round-trip.
      let previewUrl: string | null = null;
      const [own] = await drizzle
        .select({ preview_url: schema.clonedVoices.previewUrl })
        .from(schema.clonedVoices)
        .where(
          and(
            eq(schema.clonedVoices.voiceId, voiceId),
            eq(schema.clonedVoices.userId, req.user.id),
          ),
        )
        .limit(1);
      if (own?.preview_url) previewUrl = own.preview_url;

      if (!previewUrl && elevenLabsConfigured()) {
        try {
          const { getVoice } = await import("../lib/elevenlabs-client");
          const v = await getVoice(voiceId);
          previewUrl = v.preview_url ?? null;
        } catch (e) {
          log.warn("voice preview lookup failed", { error: getErrorMessage(e), voiceId });
        }
      }
      if (!previewUrl) {
        return res.status(404).json({ error: "No preview available for this voice" });
      }

      // 302 redirect to the public preview URL — simpler than streaming
      // the MP3 through our server (saves bandwidth + cold-start cost).
      // The preview URL itself is public on ElevenLabs's CDN.
      res.redirect(302, previewUrl);
    } catch (e) {
      log.error("voice preview failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Preview failed" });
    }
  },
);

// POST /api/voices/clone — instant clone from a single audio sample.
router.post(
  "/api/voices/clone",
  authenticateUser,
  cloneRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!elevenLabsConfigured()) {
        return res.status(503).json({
          error:
            "Voice cloning isn't configured. The owner needs to set ELEVENLABS_API_KEY in environment variables.",
        });
      }
      const { name, audioBase64, audioMimeType, consent_given } = req.body ?? {};
      if (typeof name !== "string" || name.trim().length < 2 || name.length > 80) {
        return res.status(400).json({ error: "Voice name must be 2-80 characters." });
      }
      if (typeof audioBase64 !== "string" || audioBase64.length < 1000) {
        return res.status(400).json({ error: "Audio sample required (≥30 sec recommended)." });
      }
      // Hard size ceiling to avoid abuse — instant clones work great
      // on 30-90s samples (typical 1-5 MB) so 25MB is plenty of headroom.
      if (audioBase64.length > 35 * 1024 * 1024) {
        return res.status(413).json({ error: "Audio sample too large (max ~25MB)." });
      }
      if (consent_given !== true) {
        return res.status(400).json({
          error:
            "Consent required. Confirm you have permission to clone this voice before submitting.",
        });
      }

      const cloned = await createInstantClone({
        name: name.trim(),
        audioBase64,
        audioMimeType: typeof audioMimeType === "string" ? audioMimeType : undefined,
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
      log.error("voice clone failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: getErrorMessage(e) });
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
      if (!own) return res.status(404).json({ error: "Voice not found in your library." });

      if (elevenLabsConfigured()) {
        try {
          await elDeleteVoice(voiceId);
        } catch (e) {
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
      log.error("voice delete failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Delete failed" });
    }
  },
);

export default router;
