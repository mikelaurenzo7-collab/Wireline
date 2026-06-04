import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { assertSameOrigin } from "./same-origin";

describe("assertSameOrigin", () => {
  const prevAppUrl = process.env.APP_URL;
  const prevCors = process.env.CORS_ORIGINS;

  beforeEach(() => {
    process.env.APP_URL = "https://app.wireline.test";
    process.env.CORS_ORIGINS = "";
  });

  afterEach(() => {
    process.env.APP_URL = prevAppUrl;
    process.env.CORS_ORIGINS = prevCors;
  });

  function app() {
    const a = express();
    a.use(assertSameOrigin);
    a.post("/api/agents", (_req, res) => res.json({ ok: true }));
    a.post("/api/webhooks/vapi", (_req, res) => res.json({ ok: true }));
    a.post("/api/intake/lead", (_req, res) => res.json({ ok: true }));
    a.post("/api/intake/keys", (_req, res) => res.json({ ok: true }));
    return a;
  }

  it("allows mutating requests from APP_URL origin", async () => {
    const res = await request(app())
      .post("/api/agents")
      .set("Origin", "https://app.wireline.test")
      .send({});
    expect(res.status).toBe(200);
  });

  it("blocks mutating requests from foreign origins", async () => {
    const res = await request(app())
      .post("/api/agents")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_ORIGIN");
  });

  it("skips origin checks for vendor webhook paths", async () => {
    const res = await request(app())
      .post("/api/webhooks/vapi")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(200);
  });

  it("skips origin checks for public intake ingest only", async () => {
    const res = await request(app())
      .post("/api/intake/lead")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(200);
  });

  it("blocks foreign origin on intake key management", async () => {
    const res = await request(app())
      .post("/api/intake/keys")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_ORIGIN");
  });
});
