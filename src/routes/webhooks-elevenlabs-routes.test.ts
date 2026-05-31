import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The handler updates wireline_cloned_voices via drizzle on a verified
// event. We stub drizzle so a verified call doesn't hit a DB, and capture
// whether the update path ran.
//
// updateSpy is created via vi.hoisted so it is initialized BEFORE the hoisted
// vi.mock factory runs. A plain top-level `const` would be in the temporal
// dead zone when the factory executes (Vitest lifts vi.mock above all module
// code), which can throw "Cannot access 'updateSpy' before initialization"
// depending on transform ordering.
const { updateSpy } = vi.hoisted(() => ({ updateSpy: vi.fn() }));

vi.mock("../lib/server-context", () => {
  const chain: any = {
    update: () => {
      updateSpy();
      return chain;
    },
    set: () => chain,
    where: () => Promise.resolve(undefined),
  };
  return {
    drizzle: chain,
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});
vi.mock("../db/schema", () => ({ clonedVoices: { voiceId: "clonedVoices.voiceId" } }));
vi.mock("../lib/elevenlabs-client", () => ({
  getVoice: vi.fn().mockResolvedValue({ preview_url: "https://cdn/preview.mp3" }),
}));

import elevenlabsRouter from "./webhooks-elevenlabs-routes";
import { installWebhookBodyParsers } from "../lib/body-parsers";

const SECRET = "elevenlabs-webhook-secret";

function appWith() {
  const app = express();
  // Mirror the production middleware ordering: raw parsers for vendor
  // webhooks BEFORE the global JSON parser. Without this, supertest's
  // request body would be consumed by express.json() and the route's
  // HMAC verifier would never see the raw Buffer it needs.
  installWebhookBodyParsers(app);
  app.use(express.json());
  app.use(elevenlabsRouter);
  return app;
}

function sign(body: unknown): string {
  return crypto.createHmac("sha256", SECRET).update(JSON.stringify(body)).digest("hex");
}

describe("POST /api/webhooks/elevenlabs", () => {
  const ORIG = process.env.ELEVENLABS_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET;
    updateSpy.mockClear();
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    else process.env.ELEVENLABS_WEBHOOK_SECRET = ORIG;
  });

  it("returns 503 when the signing secret is not configured", async () => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    const res = await request(appWith()).post("/api/webhooks/elevenlabs").send({ event_type: "x" });
    expect(res.status).toBe(503);
  });

  it("returns 401 when the signature header is missing", async () => {
    const res = await request(appWith())
      .post("/api/webhooks/elevenlabs")
      .send({ event_type: "voice.cloning.success", voice_id: "v1" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing signature/i);
  });

  it("returns 401 when the signature does not match the body", async () => {
    const body = { event_type: "voice.cloning.success", voice_id: "v1" };
    const res = await request(appWith())
      .post("/api/webhooks/elevenlabs")
      .set("xi-webhook-signature", "deadbeef")
      .send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("rejects a body whose signature was computed over different content", async () => {
    const signed = { event_type: "voice.cloning.success", voice_id: "v1" };
    const tampered = { event_type: "voice.cloning.success", voice_id: "ATTACKER" };
    const res = await request(appWith())
      .post("/api/webhooks/elevenlabs")
      .set("xi-webhook-signature", sign(signed))
      .send(tampered);
    expect(res.status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("accepts a correctly-signed success event and updates the voice row", async () => {
    const body = { event_type: "voice.cloning.success", voice_id: "v1" };
    const res = await request(appWith())
      .post("/api/webhooks/elevenlabs")
      .set("xi-webhook-signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(updateSpy).toHaveBeenCalled();
  });

  it("accepts a correctly-signed no-op event without updating any row", async () => {
    const body = { event_type: "voice.something.else" };
    const res = await request(appWith())
      .post("/api/webhooks/elevenlabs")
      .set("xi-webhook-signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
