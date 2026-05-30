import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Thenable drizzle stub: every builder method returns a chainable proxy and
// awaiting any terminal call resolves to [] (no matching tenant / no
// connections). That keeps the focus on signature verification + handshake
// control flow rather than DB behaviour. The factory is self-contained
// because vi.mock is hoisted above all top-level declarations.
vi.mock("../lib/server-context", () => {
  function builder(): any {
    const terminal = Promise.resolve([] as unknown[]);
    return new Proxy(terminal, {
      get(target, prop) {
        if (prop === "then") return (target as any).then.bind(target);
        if (prop === "catch") return (target as any).catch.bind(target);
        return () => builder();
      },
    });
  }
  const drizzleStub: any = new Proxy({}, { get: () => () => builder() });
  return {
    drizzle: drizzleStub,
    log: { warn: () => {}, error: () => {}, info: () => {} },
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
}));
vi.mock("../lib/secret-vault", () => ({ decryptSecret: (s: string) => s }));

import metaRouter from "./meta-webhook-routes";

const APP_SECRET = "meta-app-secret";
const VERIFY_TOKEN = "meta-verify-token";

function app() {
  // No global body parser: the leadgen + deletion routes mount their own
  // express.raw() so they can HMAC-verify the *raw* bytes. A global
  // express.json() would consume the stream and break signature checks.
  const a = express();
  a.use(metaRouter);
  return a;
}

describe("GET /api/webhooks/meta/leads — subscription handshake", () => {
  const ORIG = process.env.META_VERIFY_TOKEN;
  beforeEach(() => {
    process.env.META_VERIFY_TOKEN = VERIFY_TOKEN;
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.META_VERIFY_TOKEN;
    else process.env.META_VERIFY_TOKEN = ORIG;
  });

  it("returns 503 when META_VERIFY_TOKEN is unset", async () => {
    delete process.env.META_VERIFY_TOKEN;
    const res = await request(app()).get("/api/webhooks/meta/leads").query({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "abc",
    });
    expect(res.status).toBe(503);
  });

  it("echoes hub.challenge when mode + token match", async () => {
    const res = await request(app()).get("/api/webhooks/meta/leads").query({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "challenge-123",
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe("challenge-123");
  });

  it("returns 403 when the verify token is wrong", async () => {
    const res = await request(app()).get("/api/webhooks/meta/leads").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "challenge-123",
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/meta/leads — signature verification", () => {
  const ORIG = process.env.META_APP_SECRET;
  beforeEach(() => {
    process.env.META_APP_SECRET = APP_SECRET;
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = ORIG;
  });

  function sign(raw: string): string {
    return "sha256=" + createHmac("sha256", APP_SECRET).update(raw).digest("hex");
  }

  // Meta requires a 200 ack even for bad signatures (so it stops retrying an
  // unverifiable delivery), but an unsigned/forged body must NOT be processed.
  it("acks (200) but does not process when the signature is missing", async () => {
    const res = await request(app())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .send(JSON.stringify({ object: "page", entry: [] }));
    expect(res.status).toBe(200);
  });

  it("acks (200) but does not process when the signature is wrong", async () => {
    const res = await request(app())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(JSON.stringify({ object: "page", entry: [] }));
    expect(res.status).toBe(200);
  });

  it("accepts a correctly-signed payload (200)", async () => {
    const raw = JSON.stringify({ object: "page", entry: [] });
    const res = await request(app())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sign(raw))
      .send(raw);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/webhooks/meta/deletion — signed_request callback", () => {
  const ORIG = process.env.META_APP_SECRET;
  beforeEach(() => {
    process.env.META_APP_SECRET = APP_SECRET;
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = ORIG;
  });

  function buildSignedRequest(payload: object, secret = APP_SECRET): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${sig}.${encodedPayload}`;
  }

  it("returns 503 when META_APP_SECRET is unset", async () => {
    delete process.env.META_APP_SECRET;
    const res = await request(app())
      .post("/api/webhooks/meta/deletion")
      .set("content-type", "application/x-www-form-urlencoded")
      .send("signed_request=anything");
    expect(res.status).toBe(503);
  });

  it("returns 400 when signed_request is missing", async () => {
    const res = await request(app())
      .post("/api/webhooks/meta/deletion")
      .set("content-type", "application/x-www-form-urlencoded")
      .send("other=field");
    expect(res.status).toBe(400);
  });

  it("returns 400 when the signed_request signature is forged", async () => {
    const forged = buildSignedRequest({ user_id: "fb-1" }, "wrong-secret");
    const res = await request(app())
      .post("/api/webhooks/meta/deletion")
      .set("content-type", "application/x-www-form-urlencoded")
      .send(`signed_request=${encodeURIComponent(forged)}`);
    expect(res.status).toBe(400);
  });

  it("returns 200 with a confirmation code for a valid signed_request", async () => {
    const valid = buildSignedRequest({ user_id: "fb-12345" });
    const res = await request(app())
      .post("/api/webhooks/meta/deletion")
      .set("content-type", "application/x-www-form-urlencoded")
      .send(`signed_request=${encodeURIComponent(valid)}`);
    expect(res.status).toBe(200);
    expect(res.body.confirmation_code).toMatch(/^WLN-/);
    expect(res.body.url).toContain("fb-12345");
  });
});
