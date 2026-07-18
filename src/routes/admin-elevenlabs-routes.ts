/**
 * Owner-only ElevenLabs Studio Audio endpoints.
 *
 * These complete the platform-owned audio toolchain the ElevenLabs client
 * already implements: brand sound effects, jingle/music, multi-speaker
 * dialogue samples, and Scribe re-transcription for post-call QA. They are
 * gated to platform admins because they spend on the shared ElevenLabs
 * account and shape Wireline's sonic identity — they are not tenant features.
 *
 * Audio responses stream MP3 bytes so the owner can preview and then commit
 * the reviewed asset under /public/sounds. Transcription returns JSON text.
 */
import { Router, Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/api-error";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { validateBody } from "../lib/api-validation-base";
import {
  composeDialogue,
  composeMusic,
  elevenLabsConfigured,
  generateSoundEffect,
  transcribeAudio,
} from "../lib/elevenlabs-client";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// Generation is expensive and owner-only; keep a tight bucket.
const studioAudioLimiter = createRateLimiter({
  bucket: "api:admin-elevenlabs",
  windowMs: 60_000,
  max: 20,
});

function ensureConfigured(): void {
  if (!elevenLabsConfigured()) {
    throw AppError.fromHttpStatus(
      503,
      "ElevenLabs isn't configured. Set ELEVENLABS_API_KEY in environment variables.",
    );
  }
}

function sendAudio(res: Response, audio: ArrayBuffer, filename: string): void {
  const buffer = Buffer.from(audio);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(buffer.length));
  res.status(200).send(buffer);
}

router.get(
  "/api/admin/elevenlabs/status",
  authenticateUser,
  requirePlatformAdmin,
  (_req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      configured: elevenLabsConfigured(),
      capabilities: ["sound-effect", "music", "dialogue", "transcribe"],
    });
  },
);

const soundEffectSchema = z.object({
  text: z.string().trim().min(3).max(500),
  durationSeconds: z.number().min(0.5).max(22).optional(),
  promptInfluence: z.number().min(0).max(1).optional(),
});

router.post(
  "/api/admin/elevenlabs/sound-effect",
  authenticateUser,
  requirePlatformAdmin,
  studioAudioLimiter,
  validateBody(soundEffectSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    ensureConfigured();
    const { text, durationSeconds, promptInfluence } = req.body as z.infer<
      typeof soundEffectSchema
    >;
    try {
      const audio = await generateSoundEffect({ text, durationSeconds, promptInfluence });
      log.info("[admin-elevenlabs] sound effect generated", { userId: req.user.id });
      sendAudio(res, audio, "wireline-sound-effect.mp3");
    } catch (err) {
      throw AppError.internal(`Sound effect generation failed: ${getErrorMessage(err)}`);
    }
  },
);

const musicSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  musicLengthMs: z.number().int().min(3000).max(600000).optional(),
  forceInstrumental: z.boolean().optional(),
  seed: z.number().int().optional(),
});

router.post(
  "/api/admin/elevenlabs/music",
  authenticateUser,
  requirePlatformAdmin,
  studioAudioLimiter,
  validateBody(musicSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    ensureConfigured();
    const { prompt, musicLengthMs, forceInstrumental, seed } = req.body as z.infer<
      typeof musicSchema
    >;
    try {
      const audio = await composeMusic({ prompt, musicLengthMs, forceInstrumental, seed });
      log.info("[admin-elevenlabs] music composed", { userId: req.user.id });
      sendAudio(res, audio, "wireline-jingle.mp3");
    } catch (err) {
      throw AppError.internal(`Music composition failed: ${getErrorMessage(err)}`);
    }
  },
);

const dialogueSchema = z.object({
  inputs: z
    .array(
      z.object({
        voice_id: z.string().trim().min(1).max(120),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
  modelId: z.string().trim().min(1).max(80).optional(),
});

router.post(
  "/api/admin/elevenlabs/dialogue",
  authenticateUser,
  requirePlatformAdmin,
  studioAudioLimiter,
  validateBody(dialogueSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    ensureConfigured();
    const { inputs, modelId } = req.body as z.infer<typeof dialogueSchema>;
    try {
      const audio = await composeDialogue({ inputs, modelId });
      log.info("[admin-elevenlabs] dialogue composed", {
        userId: req.user.id,
        lines: inputs.length,
      });
      sendAudio(res, audio, "wireline-dialogue.mp3");
    } catch (err) {
      throw AppError.internal(`Dialogue composition failed: ${getErrorMessage(err)}`);
    }
  },
);

const transcribeSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().trim().min(3).max(80).optional(),
});

router.post(
  "/api/admin/elevenlabs/transcribe",
  authenticateUser,
  requirePlatformAdmin,
  studioAudioLimiter,
  validateBody(transcribeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    ensureConfigured();
    const { audioBase64, mimeType } = req.body as z.infer<typeof transcribeSchema>;
    try {
      const text = await transcribeAudio(audioBase64, mimeType);
      log.info("[admin-elevenlabs] scribe transcription complete", { userId: req.user.id });
      res.setHeader("Cache-Control", "no-store");
      res.json({ text });
    } catch (err) {
      throw AppError.internal(`Transcription failed: ${getErrorMessage(err)}`);
    }
  },
);

export default router;
