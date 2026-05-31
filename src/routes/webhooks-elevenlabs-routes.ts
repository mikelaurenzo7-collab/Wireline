/**
 * POST /api/webhooks/elevenlabs — handles voice-cloning completion events.
 *
 * For Instant Voice Cloning (the only path live today) the response is
 * synchronous so this webhook is currently a no-op safety net. It
 * exists so the URL is registered + signature-verified for when we
 * enable Professional Voice Cloning (30 min+ samples, async, fires
 * `voice.cloning.success` when ready).
 *
 * Signature verification: HMAC-SHA256 over the raw request body using
 * ELEVENLABS_WEBHOOK_SECRET. ElevenLabs sends the signature in the
 * `xi-webhook-signature` header.
 */
import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { log, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";

const router = Router();

router.post("/api/webhooks/elevenlabs", async (req: Request, res: Response) => {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    log.warn("ElevenLabs webhook hit but ELEVENLABS_WEBHOOK_SECRET unset");
    return res.status(503).json({ error: "Webhook not configured" });
  }

  const sig = req.headers["xi-webhook-signature"] as string | undefined;
  if (!sig) {
    log.warn("ElevenLabs webhook missing signature", {
      ip: req.ip,
      ts: Date.now(),
    });
    return res.status(401).json({ error: "Missing signature" });
  }

  // The raw request bytes — required for byte-identical HMAC. The
  // raw body parser is mounted centrally in src/lib/body-parsers.ts
  // BEFORE the global express.json(), so req.body is a Buffer here.
  // We refuse to verify against a re-serialized parsed object because
  // JSON.stringify is not byte-stable (key order, whitespace, unicode
  // escaping all drift from what ElevenLabs signed).
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    log.error("ElevenLabs webhook: raw body unavailable (body parser misordered?)", {
      bodyType: typeof rawBody,
    });
    return res.status(500).json({ error: "Webhook misconfigured" });
  }

  let expectedSig: string;
  try {
    expectedSig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  } catch (err) {
    log.error("ElevenLabs webhook: HMAC compute failed", { error: getErrorMessage(err) });
    return res.status(500).json({ error: "Signature check failed" });
  }

  let valid = false;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    valid = false;
  }

  if (!valid) {
    log.warn("ElevenLabs webhook signature verification failed", {
      ip: req.ip,
      sig_prefix: sig.slice(0, 8),
      ts: Date.now(),
    });
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Parse the (now signature-verified) JSON envelope.
  let payload: { event_type?: string; voice_id?: string };
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as {
      event_type?: string;
      voice_id?: string;
    };
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  try {
    const event = payload.event_type;
    const voiceId = payload.voice_id;

    if (event === "voice.cloning.success" && voiceId) {
      // Mark the matching row completed + pull a fresh preview_url
      // if we don't have one yet.
      try {
        const { getVoice } = await import("../lib/elevenlabs-client");
        const v = await getVoice(voiceId);
        await drizzle
          .update(schema.clonedVoices)
          .set({ status: "completed", previewUrl: v.preview_url ?? null })
          .where(eq(schema.clonedVoices.voiceId, voiceId));
      } catch (e) {
        log.warn("Failed to fetch fresh voice metadata post-clone", {
          voiceId,
          error: getErrorMessage(e),
        });
        await drizzle
          .update(schema.clonedVoices)
          .set({ status: "completed" })
          .where(eq(schema.clonedVoices.voiceId, voiceId));
      }
      log.info("ElevenLabs clone succeeded (webhook)", { voiceId });
    } else if (event === "voice.cloning.failed" && voiceId) {
      await drizzle
        .update(schema.clonedVoices)
        .set({ status: "failed" })
        .where(eq(schema.clonedVoices.voiceId, voiceId));
      log.warn("ElevenLabs clone failed (webhook)", { voiceId });
    } else {
      log.info("ElevenLabs webhook event (no-op)", { event, voiceId });
    }

    return res.json({ ok: true });
  } catch (e) {
    log.error("ElevenLabs webhook handler failed", { error: getErrorMessage(e) });
    return res.status(500).json({ error: "Handler error" });
  }
});

export default router;
