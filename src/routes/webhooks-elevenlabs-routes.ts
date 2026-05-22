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

  // The raw body must be available for HMAC verification. We
  // configure express.json() with verify hook OR mount this route
  // before express.json() and use express.raw(). Simplest path:
  // re-serialize req.body (already parsed) for verification. This
  // works as long as the body is canonical JSON (no key reordering),
  // which ElevenLabs guarantees. If verification ever flakes, switch
  // to express.raw() on this route specifically.
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(typeof req.body === "string" ? req.body : JSON.stringify(req.body))
    .digest("hex");

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

  try {
    const event = req.body?.event_type as string | undefined;
    const voiceId = req.body?.voice_id as string | undefined;

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
