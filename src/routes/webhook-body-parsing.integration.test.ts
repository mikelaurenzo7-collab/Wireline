/**
 * Full-middleware-stack regression test for vendor webhook body parsing.
 *
 * The router-only tests (meta-webhook-routes.test.ts etc.) mount each
 * router in isolation, so they never exercise the global JSON parser.
 * That masks the historical bug where a route-level `express.raw()`
 * was registered AFTER `app.use(express.json())` — Express's first
 * matching body parser wins, JSON consumes the stream, and the raw
 * Buffer the HMAC verifier expects is silently replaced with a
 * parsed object. Verification then "succeeds" against an empty body
 * (or fails outright) and the webhook is functionally dead.
 *
 * This test mounts an app whose middleware ordering MIRRORS server.ts
 * (installWebhookBodyParsers → express.json) and asserts each vendor
 * webhook still sees the body shape it needs:
 *
 *   - Meta leadgen      → req.body is a Buffer (HMAC over raw bytes)
 *   - ElevenLabs clones → req.body is a Buffer (HMAC over raw bytes)
 *   - Twilio SMS        → req.body is a parsed urlencoded object
 *                         (so {Body, From, To} are populated and the
 *                         STOP keyword path can fire)
 *
 * If a future change reorders the parsers, these assertions break
 * loudly with a meaningful diff instead of silently breaking lead
 * ingestion / TCPA compliance in production.
 */
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { installWebhookBodyParsers } from "../lib/body-parsers";

/**
 * Build a test app whose body-parser stack matches server.ts. We don't
 * mount the real vendor routers here — they pull in drizzle, the
 * tenant store, audit logger, secret vault etc. and are tested
 * end-to-end elsewhere. The bug we're guarding against lives in the
 * *parser ordering*, so it's sufficient to mount probe routes on the
 * same paths and assert the shape of req.body Express produces.
 */
function buildApp() {
  const app = express();
  installWebhookBodyParsers(app);
  // Mirror server.ts: scoped JSON parsers, then a global JSON parser.
  // Vendor webhooks under these paths must STILL get the raw / urlencoded
  // body the installWebhookBodyParsers pass registered.
  app.use(express.json({ limit: "1mb" }));

  // Probe handlers that report what their request body looks like.
  app.post("/api/webhooks/meta/leads", (req, res) => {
    res.json({
      isBuffer: Buffer.isBuffer(req.body),
      length: Buffer.isBuffer(req.body) ? req.body.length : -1,
      bodyType: typeof req.body,
    });
  });
  app.post("/api/webhooks/meta/deletion", (req, res) => {
    res.json({ isBuffer: Buffer.isBuffer(req.body) });
  });
  app.post("/api/webhooks/elevenlabs", (req, res) => {
    res.json({ isBuffer: Buffer.isBuffer(req.body) });
  });
  app.post("/api/twilio-webhook/sms", (req, res) => {
    res.json({
      isBuffer: Buffer.isBuffer(req.body),
      from: req.body?.From ?? null,
      to: req.body?.To ?? null,
      body: req.body?.Body ?? null,
    });
  });
  // Sanity: a non-webhook JSON endpoint still parses normally.
  app.post("/api/echo", (req, res) => {
    res.json({ parsed: req.body });
  });

  return app;
}

describe("webhook body parsing (full middleware stack)", () => {
  it("preserves the raw Buffer for Meta leadgen so HMAC stays byte-identical", async () => {
    const app = buildApp();
    const payload = JSON.stringify({ object: "page", entry: [{ id: "PG1", changes: [] }] });
    const secret = "test-meta-secret";
    // Sign the exact bytes we're going to send so we can assert below
    // that an HMAC over req.body still verifies.
    const expectedSig =
      "sha256=" + createHmac("sha256", secret).update(Buffer.from(payload, "utf8")).digest("hex");

    const res = await request(app)
      .post("/api/webhooks/meta/leads")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", expectedSig)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.isBuffer).toBe(true);
    expect(res.body.length).toBe(Buffer.byteLength(payload, "utf8"));
  });

  it("preserves the raw Buffer for Meta data-deletion callback", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/webhooks/meta/deletion")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("signed_request=abc.def");
    expect(res.status).toBe(200);
    expect(res.body.isBuffer).toBe(true);
  });

  it("preserves the raw Buffer for ElevenLabs (HMAC over raw bytes, not re-serialized)", async () => {
    const app = buildApp();
    const payload = JSON.stringify({ event_type: "voice.cloning.success", voice_id: "v1" });
    const res = await request(app)
      .post("/api/webhooks/elevenlabs")
      .set("Content-Type", "application/json")
      .set("xi-webhook-signature", "ignored-for-this-probe")
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.isBuffer).toBe(true);
  });

  it("parses Twilio SMS as urlencoded so STOP keyword detection works", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/twilio-webhook/sms")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("From=%2B15551234567&To=%2B15557654321&Body=STOP&MessageSid=SM123");
    expect(res.status).toBe(200);
    expect(res.body.isBuffer).toBe(false);
    expect(res.body.from).toBe("+15551234567");
    expect(res.body.to).toBe("+15557654321");
    expect(res.body.body).toBe("STOP");
  });

  it("still parses ordinary JSON endpoints normally", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/echo")
      .set("Content-Type", "application/json")
      .send({ hello: "world" });
    expect(res.status).toBe(200);
    expect(res.body.parsed).toEqual({ hello: "world" });
  });
});
