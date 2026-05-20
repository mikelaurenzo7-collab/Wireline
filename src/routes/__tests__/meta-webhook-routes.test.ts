/**
 * Smoke coverage for the Meta Lead Ads webhook. We exercise the
 * GET subscription handshake and the POST signature-verification
 * gate without hitting Meta's Graph API or the database — those
 * paths return null/no-op when env or token isn't usable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

vi.mock("../../lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: async () => undefined,
      }),
    }),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/secret-vault", () => ({
  decryptSecret: (v: string) => v,
  encryptSecret: (v: string) => v,
}));

async function makeApp() {
  const router = (await import("../meta-webhook-routes")).default;
  const app = express();
  app.use(router);
  return app;
}

describe("Meta Lead Ads webhook", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.META_VERIFY_TOKEN = "test-verify-token-32-chars-min-abcd";
    process.env.META_APP_SECRET = "test-app-secret-32-chars-min-abcd1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("echoes hub.challenge on a valid subscription handshake", async () => {
    const app = await makeApp();
    const res = await request(app).get(
      "/api/webhooks/meta/leads?hub.mode=subscribe&hub.verify_token=test-verify-token-32-chars-min-abcd&hub.challenge=challenge-value-42",
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe("challenge-value-42");
  });

  it("rejects the handshake on bad verify token", async () => {
    const app = await makeApp();
    const res = await request(app).get(
      "/api/webhooks/meta/leads?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x",
    );
    expect(res.status).toBe(403);
  });

  it("returns 503 when META_VERIFY_TOKEN is missing", async () => {
    delete process.env.META_VERIFY_TOKEN;
    const app = await makeApp();
    const res = await request(app).get(
      "/api/webhooks/meta/leads?hub.mode=subscribe&hub.verify_token=x&hub.challenge=x",
    );
    expect(res.status).toBe(503);
  });

  it("acks unsigned POST without processing (silent reject)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .send({ object: "page", entry: [] });
    // Always 200 so Meta doesn't retry an unverifiable payload, but
    // the handler bails before any processing.
    expect(res.status).toBe(200);
  });

  it("acks a correctly signed POST", async () => {
    const app = await makeApp();
    const body = JSON.stringify({ object: "page", entry: [] });
    const sig =
      "sha256=" + createHmac("sha256", process.env.META_APP_SECRET!).update(body).digest("hex");
    const res = await request(app)
      .post("/api/webhooks/meta/leads")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sig)
      .send(body);
    expect(res.status).toBe(200);
  });

  describe("Data Deletion Callback", () => {
    function buildSignedRequest(payload: object, secret: string) {
      // Facebook's signed_request format:
      //   base64url(HMAC-SHA256(encoded_payload)) + "." + encoded_payload
      const b64url = (b: Buffer): string =>
        b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const encodedPayload = b64url(Buffer.from(JSON.stringify(payload)));
      const sig = createHmac("sha256", secret).update(encodedPayload).digest();
      return `${b64url(sig)}.${encodedPayload}`;
    }

    it("returns 503 when META_APP_SECRET is missing", async () => {
      delete process.env.META_APP_SECRET;
      const app = await makeApp();
      const res = await request(app)
        .post("/api/webhooks/meta/deletion")
        .type("form")
        .send({ signed_request: "anything.anything" });
      expect(res.status).toBe(503);
    });

    it("rejects POST with missing signed_request body", async () => {
      const app = await makeApp();
      const res = await request(app).post("/api/webhooks/meta/deletion").type("form").send({});
      expect(res.status).toBe(400);
    });

    it("rejects POST with bad signature", async () => {
      const app = await makeApp();
      const res = await request(app)
        .post("/api/webhooks/meta/deletion")
        .type("form")
        .send({ signed_request: "deadbeef.eyJ1c2VyX2lkIjoiMTIzIn0" });
      expect(res.status).toBe(400);
    });

    it("returns valid {url, confirmation_code} for a correctly signed request", async () => {
      const app = await makeApp();
      const signed = buildSignedRequest(
        { user_id: "1234567890", algorithm: "HMAC-SHA256", issued_at: 1700000000 },
        process.env.META_APP_SECRET!,
      );
      const res = await request(app)
        .post("/api/webhooks/meta/deletion")
        .type("form")
        .send({ signed_request: signed });
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https?:\/\//);
      expect(res.body.url).toContain("fbid=1234567890");
      expect(res.body.confirmation_code).toMatch(/^WLN-[A-Z0-9]{8}$/);
    });
  });
});
