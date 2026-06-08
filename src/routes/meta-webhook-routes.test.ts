import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Drizzle stub: query-builder methods return a chainable thenable that
// resolves to [] (no matching tenant / no connections), keeping the focus
// on signature verification + handshake control flow rather than DB
// behaviour. `select`/`insert`/`update` are vi.fn()s so tests can assert
// whether the handler reached the DB — i.e. whether it processed a payload
// or short-circuited on signature verification. The factory is
// self-contained because vi.mock is hoisted above all top-level decls.
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
  return {
    drizzle: {
      select: vi.fn(() => builder()),
      insert: vi.fn(() => builder()),
      update: vi.fn(() => builder()),
    },
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
import { drizzle } from "../lib/server-context";
import { installWebhookBodyParsers } from "../lib/body-parsers";
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";

const selectSpy = vi.mocked(drizzle.select as unknown as ReturnType<typeof vi.fn>);

/** Let the handler's post-ack async processing run before asserting. */
const flush = () => new Promise((r) => setTimeout(r, 0));

const APP_SECRET = "meta-app-secret";
const VERIFY_TOKEN = "meta-verify-token";

function app() {
  // Production middleware ordering: install vendor-webhook body parsers
  // (registers express.raw for the Meta routes) BEFORE the global
  // express.json. Previously the per-route express.raw lived inside the
  // router itself, but it sat behind server.ts's global json() so it
  // was a no-op in production. The fix moved parser registration to
  // installWebhookBodyParsers; this test mirrors that ordering so a
  // future regression of either piece breaks here loudly.
  const a = express();
  mountRouteTestRequestContext(a);
  installWebhookBodyParsers(a);
  a.use(express.json());
  a.use(metaRouter);
  mountTestErrorHandler(a);
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
    selectSpy.mockClear();
  });
  afterEach(() => {
    if (ORIG === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = ORIG;
  });

  function sign(raw: string): string {
    return "sha256=" + createHmac("sha256", APP_SECRET).update(raw).digest("hex");
  }

  // A real, *handled* change (leadgen) — so reaching the processing path is
  // observable as a tenant-resolution DB read (drizzle.select). With entry:[]
  // the handler never touches the DB even on a valid signature, which is why
  // an empty body can't distinguish "verified-but-empty" from "verification
  // was skipped entirely" (Codex P2). A populated leadgen change can.
  const LEADGEN_BODY = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "page-123",
        changes: [{ field: "leadgen", value: { leadgen_id: "lead-1", form_id: "form-1" } }],
      },
    ],
  });

  // Meta requires a 200 ack even for bad signatures (so it stops retrying an
  // unverifiable delivery), but an unsigned/forged body must NOT be processed.
  it("acks (200) but does NOT reach the DB when the signature is missing", async () => {
    const res = await request(app())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .send(LEADGEN_BODY);
    expect(res.status).toBe(200);
    await flush();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("acks (200) but does NOT reach the DB when the signature is forged", async () => {
    const res = await request(app())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(LEADGEN_BODY);
    expect(res.status).toBe(200);
    await flush();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("acks (200) but does NOT reach the DB when the signature is valid for a DIFFERENT body", async () => {
    // Signature is computed over an empty-entry body, then a populated
    // leadgen body is sent — the HMAC must not validate.
    const res = await request(app())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sign(JSON.stringify({ object: "page", entry: [] })))
      .send(LEADGEN_BODY);
    expect(res.status).toBe(200);
    await flush();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("processes a correctly-signed leadgen change (reaches tenant lookup)", async () => {
    const res = await request(app())
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sign(LEADGEN_BODY))
      .send(LEADGEN_BODY);
    expect(res.status).toBe(200);
    await flush();
    // Verified payload → handler resolves the owning tenant via drizzle.select.
    expect(selectSpy).toHaveBeenCalled();
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
