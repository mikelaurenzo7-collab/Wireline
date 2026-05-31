/**
 * Regression test for the webhook body-parsing ordering bug.
 *
 * Router-only unit tests mount each webhook router in isolation, which masks a
 * production middleware-ordering bug: in server.ts the global express.json()
 * runs before the webhook routes, so it consumes the request stream and the
 * route-scoped raw/urlencoded parsers see nothing — breaking signature
 * verification (Meta, ElevenLabs) and form-field access (Twilio).
 *
 * This test wires the REAL production body-parser stack (installBodyParsers,
 * the exact ordering server.ts uses) ahead of the REAL webhook routers and
 * asserts that:
 *   - a correctly-signed Meta leadgen delivery is verified and reaches tenant
 *     resolution (raw body survived the global JSON parser),
 *   - a correctly-signed ElevenLabs event is verified and processed,
 *   - a Twilio STOP keyword (application/x-www-form-urlencoded) is parsed and
 *     triggers the opt-out reply.
 *
 * If the global express.json() were ever moved ahead of these parsers again,
 * all three assertions would fail.
 */
import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared, configurable drizzle stub. `selectRows` lets each test control what a
// SELECT resolves to (e.g. an owning tenant for Twilio, or none for Meta) while
// every builder method stays chainable and thenable.
const state: { selectRows: unknown[] } = { selectRows: [] };
const { updateSpy, selectSpy } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  selectSpy: vi.fn(),
}));

vi.mock("../lib/server-context", () => {
  function builder(): any {
    const terminal = {
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(state.selectRows).then(res, rej),
      catch: (rej: (e: unknown) => unknown) => Promise.resolve(state.selectRows).catch(rej),
    };
    return new Proxy(terminal, {
      get(target, prop) {
        if (prop === "then") return (target as any).then;
        if (prop === "catch") return (target as any).catch;
        return () => builder();
      },
    });
  }
  return {
    drizzle: {
      select: vi.fn(() => {
        selectSpy();
        return builder();
      }),
      insert: vi.fn(() => builder()),
      update: vi.fn(() => {
        updateSpy();
        return builder();
      }),
      delete: vi.fn(() => builder()),
    },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});

vi.mock("../db/schema", () => ({
  crmConnections: {
    userId: "crmConnections.userId",
    accessToken: "crmConnections.accessToken",
    metadata: "crmConnections.metadata",
    provider: "crmConnections.provider",
    active: "crmConnections.active",
    id: "crmConnections.id",
    updatedAt: "crmConnections.updatedAt",
  },
  outboundLeads: {},
  fleetTasks: {},
  clonedVoices: { voiceId: "clonedVoices.voiceId" },
  phoneNumbers: { userId: "phoneNumbers.userId", phoneNumber: "phoneNumbers.phoneNumber" },
  settings: { userId: "settings.userId", twilioSmsFromNumber: "settings.twilioSmsFromNumber" },
  dncList: { userId: "dncList.userId", phone: "dncList.phone" },
  consentLog: {},
}));
vi.mock("../lib/secret-vault", () => ({ decryptSecret: (s: string) => s }));
vi.mock("../lib/elevenlabs-client", () => ({
  getVoice: vi.fn().mockResolvedValue({ preview_url: "https://cdn/preview.mp3" }),
}));

import { installBodyParsers } from "../lib/body-parsers";
import metaRouter from "./meta-webhook-routes";
import elevenlabsRouter from "./webhooks-elevenlabs-routes";
import twilioRouter from "./twilio-webhook";

const META_APP_SECRET = "meta-app-secret";
const ELEVENLABS_SECRET = "elevenlabs-webhook-secret";

/** Build an app with the SAME body-parser ordering as server.ts. */
function fullStackApp() {
  const app = express();
  installBodyParsers(app);
  app.use(twilioRouter);
  app.use(elevenlabsRouter);
  app.use(metaRouter);
  return app;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("webhook body parsing — full middleware stack", () => {
  const origMeta = process.env.META_APP_SECRET;
  const origEleven = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const origTwilio = process.env.TWILIO_AUTH_TOKEN;
  const origNodeEnv = process.env.NODE_ENV;
  const origVercel = process.env.VERCEL;

  beforeEach(() => {
    process.env.META_APP_SECRET = META_APP_SECRET;
    process.env.ELEVENLABS_WEBHOOK_SECRET = ELEVENLABS_SECRET;
    // Twilio dev passthrough: no auth token + non-prod → signature check skipped
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.NODE_ENV = "test";
    delete process.env.VERCEL;
    state.selectRows = [];
    updateSpy.mockClear();
    selectSpy.mockClear();
  });
  afterEach(() => {
    process.env.META_APP_SECRET = origMeta;
    process.env.ELEVENLABS_WEBHOOK_SECRET = origEleven;
    if (origTwilio === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = origTwilio;
    process.env.NODE_ENV = origNodeEnv;
    if (origVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = origVercel;
  });

  it("#1 Meta leadgen: a correctly-signed delivery is verified despite the global JSON parser", async () => {
    const body = JSON.stringify({
      object: "page",
      entry: [
        {
          id: "page-123",
          changes: [{ field: "leadgen", value: { leadgen_id: "lead-1", form_id: "form-1" } }],
        },
      ],
    });
    const sig = "sha256=" + createHmac("sha256", META_APP_SECRET).update(body).digest("hex");

    const res = await request(fullStackApp())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sig)
      .send(body);

    expect(res.status).toBe(200);
    await flush();
    // Reaching tenant resolution proves the raw bytes survived for HMAC.
    expect(selectSpy).toHaveBeenCalled();
  });

  it("#1 Meta leadgen: a forged signature is NOT processed", async () => {
    const body = JSON.stringify({
      object: "page",
      entry: [{ id: "page-123", changes: [{ field: "leadgen", value: { leadgen_id: "x" } }] }],
    });
    const res = await request(fullStackApp())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(body);

    expect(res.status).toBe(200);
    await flush();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("#3 ElevenLabs: a correctly-signed event is verified over the raw body", async () => {
    const raw = JSON.stringify({ event_type: "voice.cloning.success", voice_id: "v1" });
    const sig = createHmac("sha256", ELEVENLABS_SECRET).update(raw).digest("hex");

    const res = await request(fullStackApp())
      .post("/api/webhooks/elevenlabs")
      .set("content-type", "application/json")
      .set("xi-webhook-signature", sig)
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(updateSpy).toHaveBeenCalled();
  });

  it("#3 ElevenLabs: a signature over a re-serialized object would NOT match (raw bytes only)", async () => {
    // Sign over pretty-printed JSON: bytes differ from what is sent, so the
    // HMAC must fail — proving verification is byte-exact, not object-based.
    const obj = { event_type: "voice.cloning.success", voice_id: "v1" };
    const raw = JSON.stringify(obj);
    const sigOverPretty = createHmac("sha256", ELEVENLABS_SECRET)
      .update(JSON.stringify(obj, null, 2))
      .digest("hex");

    const res = await request(fullStackApp())
      .post("/api/webhooks/elevenlabs")
      .set("content-type", "application/json")
      .set("xi-webhook-signature", sigOverPretty)
      .send(raw);

    expect(res.status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("#2 Twilio: a STOP keyword (form-urlencoded) is parsed and triggers opt-out", async () => {
    // lookupTenant's first SELECT resolves to an owning tenant.
    state.selectRows = [{ userId: "tenant-1" }];

    const res = await request(fullStackApp())
      .post("/api/twilio-webhook/sms")
      .type("form")
      .send({ From: "+15551230000", To: "+15559999999", Body: "STOP", MessageSid: "SM1" });

    expect(res.status).toBe(200);
    // The opt-out reply is only produced if req.body.Body parsed to "STOP".
    expect(res.text).toMatch(/unsubscribed/i);
  });

  it("#2 Twilio: an empty req.body (parser missing) would 400 — guards against regression", async () => {
    // A non-keyword body still parses; From/To present → not a 400. This proves
    // the urlencoded parser ran (otherwise From/To would be empty → 400).
    state.selectRows = [{ userId: "tenant-1" }];
    const res = await request(fullStackApp())
      .post("/api/twilio-webhook/sms")
      .type("form")
      .send({ From: "+15551230000", To: "+15559999999", Body: "hello there", MessageSid: "SM2" });

    expect(res.status).toBe(200);
    // Non-keyword → empty TwiML response, NOT the 400 returned when From/To are
    // missing (which is what happens if the body never parsed).
    expect(res.text).toContain("<Response/>");
  });
});
