// src/lib/request-id.test.ts
//
// @vitest-environment node
//
// Verifies that the X-Request-Id propagation contract is upheld at the
// Express middleware layer.
//
// Covers:
//   1. Server generates a UUID and returns it in X-Request-Id when the
//      client does not supply one.
//   2. Client-supplied X-Request-Id is echoed back (pass-through).
//   3. Malformed / overlong client values are rejected; a server-generated
//      id is used instead.
//   4. The request-id is stable within a single request (same value
//      in X-Request-Id response header as in any body echo).
//   5. Two concurrent requests receive different request-ids.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import http from "node:http";
import { randomUUID } from "node:crypto";

// ──────────────────────────────────────────────────────────────────────
//  Minimal Express app that mirrors the request-id middleware in server.ts
// ──────────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();

  // Mirrors server.ts request-id middleware (lines ~238-245)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64);
    const requestId =
      incoming && /^[A-Za-z0-9._-]+$/.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  // Echo endpoint — returns the server-side requestId so tests can
  // verify it matches the response header.
  app.get("/echo", (_req: Request, res: Response) => {
    res.json({ requestId: res.locals.requestId });
  });

  return app;
}

// ──────────────────────────────────────────────────────────────────────
//  Harness
// ──────────────────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = buildApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

// ──────────────────────────────────────────────────────────────────────
//  Tests
// ──────────────────────────────────────────────────────────────────────

describe("X-Request-Id — server-generated", () => {
  it("response includes X-Request-Id header when client omits it", async () => {
    const res = await request(baseUrl).get("/echo");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/); // UUID v4 format
  });

  it("server-generated id is consistent within the request (header equals body)", async () => {
    const res = await request(baseUrl).get("/echo");
    expect(res.headers["x-request-id"]).toBe(res.body.requestId);
  });

  it("two separate requests receive different request-ids", async () => {
    const [r1, r2] = await Promise.all([
      request(baseUrl).get("/echo"),
      request(baseUrl).get("/echo"),
    ]);
    expect(r1.headers["x-request-id"]).not.toBe(r2.headers["x-request-id"]);
  });
});

describe("X-Request-Id — client pass-through", () => {
  it("echoes back a valid client-supplied X-Request-Id", async () => {
    const clientId = "trace-abc123";
    const res = await request(baseUrl)
      .get("/echo")
      .set("X-Request-Id", clientId);
    expect(res.headers["x-request-id"]).toBe(clientId);
    expect(res.body.requestId).toBe(clientId);
  });

  it("accepts alphanumeric + dot + dash + underscore characters", async () => {
    const clientId = "req.2026-05-11_abc";
    const res = await request(baseUrl)
      .get("/echo")
      .set("X-Request-Id", clientId);
    expect(res.headers["x-request-id"]).toBe(clientId);
  });
});

describe("X-Request-Id — malformed client values are rejected", () => {
  it("rejects a value containing spaces — falls back to server UUID", async () => {
    const res = await request(baseUrl)
      .get("/echo")
      .set("X-Request-Id", "bad value with spaces");
    // Must NOT echo the malformed value; must be a UUID instead
    expect(res.headers["x-request-id"]).not.toBe("bad value with spaces");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a value with angle brackets — falls back to server UUID", async () => {
    const res = await request(baseUrl)
      .get("/echo")
      .set("X-Request-Id", "<script>alert(1)</script>");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("truncates an overlong value (> 64 chars) to at most 64 characters", async () => {
    // The middleware slices client-supplied values to 64 chars before
    // validating. A 70-char all-valid string is sliced to 64 chars and
    // still passes the regex — so the echoed value is the first 64 chars,
    // NOT a server-generated UUID.
    const longId = "a".repeat(70);
    const res = await request(baseUrl)
      .get("/echo")
      .set("X-Request-Id", longId);
    // After .slice(0, 64) the value is valid (all 'a'); verify truncation occurred.
    expect(res.headers["x-request-id"]).toBe("a".repeat(64));
    expect(res.headers["x-request-id"]?.length).toBe(64);
  });
});
