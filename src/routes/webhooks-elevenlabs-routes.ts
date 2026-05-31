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
import express from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { log, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import * as schema from "../db/schema";

const router = Router();

router.post(
  "/api/webhooks/elevenlabs",
  // Mount a route-scoped raw parser so the exact bytes are available for HMAC
  // verification. server.ts also registers this ahead of the global
  // express.json() (see installBodyParsers); this inline parser keeps the route
  // self-contained for router-only tests. If the body was already parsed
  // upstream this is a no-op (express marks req._body and skips).
  express.raw({ type: "*/*" }),
  async (req: Request, res: Response) => {
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

    // HMAC-SHA256 over the *raw* request bytes. Re-serialising a parsed object
    // (JSON.stringify) is not byte-identical to what ElevenLabs signed —
    // whitespace and key ordering differ — so the HMAC must run over the raw
    // Buffer captured by express.raw() above.
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""));

    let valid = false;
    try {
      const expectedSig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
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

    let body: { event_type?: string; voice_id?: string };
    try {
      body = JSON.parse(rawBody.toString("utf8")) as { event_type?: string; voice_id?: string };
    } catch {
      return res.status(400).json({ error: "Bad JSON" });
    }

    try {
      const event = body?.event_type;
      const voiceId = body?.voice_id;

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
  },
);

export default router;
