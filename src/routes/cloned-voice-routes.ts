import express, { Router } from "express";

import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { liveVoiceService } from "../lib/voice/live-voice-service";
import { AppError } from "../lib/api-error";
import type { AuthenticatedRequest } from "../types/auth";

/**
 * Live cloned voices: record or upload a consented reference, hear an A/B
 * against the stock voice, put it on a Bot, and switch back in one tap.
 * The reference is raw WAV (not base64) so a full two-minute read fits.
 */
const router = Router();
const reads = createRateLimiter({ bucket: "api:live-voices-read", windowMs: 60_000, max: 30 });
const writes = createRateLimiter({
  bucket: "api:live-voices-write",
  windowMs: 60_000,
  max: 10,
  failClosedOnError: true,
});
const creates = createRateLimiter({
  bucket: "api:live-voices-create",
  windowMs: 60 * 60_000,
  max: 6,
  failClosedOnError: true,
});
const previews = createRateLimiter({
  bucket: "api:live-voices-preview",
  windowMs: 60_000,
  max: 12,
  failClosedOnError: true,
});
const rawWav = express.raw({ type: ["audio/wav", "audio/x-wav", "audio/wave"], limit: "6mb" });

function wavBody(req: AuthenticatedRequest): Buffer {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0)
    throw new AppError(415, "LIVE_VOICE_WAV_REQUIRED", "Send the recording as a WAV file.");
  return req.body;
}

router.get(
  "/api/voice/live-voices",
  authenticateUser,
  reads,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await liveVoiceService.list(req.user));
  },
);

/** Quality check only: nothing is stored or sent anywhere. */
router.post(
  "/api/voice/live-voices/check",
  authenticateUser,
  writes,
  rawWav,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ quality: liveVoiceService.inspect(wavBody(req)) });
  },
);

/** Upper bound on the encoded clone-details header. */
const CLONE_DETAILS_HEADER_MAX = 2_000;

/**
 * Personal clone details (voice name, typed legal name, where the speaker
 * lives) ride in one URI-encoded JSON header, never the URL, so they stay out
 * of access logs and browser history. The body stays the raw WAV.
 */
export function readCloneDetailsHeader(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw || raw.length > CLONE_DETAILS_HEADER_MAX) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

router.post(
  "/api/voice/live-voices",
  authenticateUser,
  creates,
  rawWav,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    const details = readCloneDetailsHeader(req.headers["x-voice-clone-details"]);
    const result = await liveVoiceService.create(req.user, wavBody(req), {
      name: details.name,
      consentAccepted: details.consentAccepted === true,
      consentVersion: details.consentVersion,
      consentScope: details.consentScope,
      gender: details.gender,
      speakerJurisdiction: details.speakerJurisdiction,
      biometricReleaseAccepted: details.biometricReleaseAccepted === true,
      biometricReleaseVersion: details.biometricReleaseVersion,
      biometricReleaseSignedName: details.biometricReleaseSignedName,
      agentName: details.agentName,
    });
    res.status(201).json(result);
  },
);

router.delete(
  "/api/voice/live-voices/:voiceId",
  authenticateUser,
  writes,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await liveVoiceService.remove(req.user, req.params.voiceId));
  },
);

router.get(
  "/api/voice/live-voices/:voiceId/preview",
  authenticateUser,
  previews,
  async (req: AuthenticatedRequest, res) => {
    const variant = req.query.variant === "stock" ? "stock" : "clone";
    const audio = await liveVoiceService.preview(req.user, req.params.voiceId, {
      variant,
      agentName: typeof req.query.agentName === "string" ? req.query.agentName : undefined,
      stockVoice: typeof req.query.stockVoice === "string" ? req.query.stockVoice : undefined,
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audio);
  },
);

router.post(
  "/api/agents/:agentId/live-voice",
  authenticateUser,
  writes,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    const voiceId = typeof req.body?.voiceId === "string" ? req.body.voiceId : "";
    res.json(
      voiceId
        ? await liveVoiceService.useOnBot(req.user, voiceId, req.params.agentId)
        : await liveVoiceService.useStock(req.user, req.params.agentId),
    );
  },
);

router.delete(
  "/api/agents/:agentId/live-voice",
  authenticateUser,
  writes,
  async (req: AuthenticatedRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await liveVoiceService.useStock(req.user, req.params.agentId));
  },
);

export default router;
