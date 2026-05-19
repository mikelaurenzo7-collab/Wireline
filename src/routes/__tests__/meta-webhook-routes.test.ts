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
});
