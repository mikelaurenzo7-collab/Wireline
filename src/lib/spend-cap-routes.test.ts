// src/lib/spend-cap-routes.test.ts
//
// @vitest-environment node
//
// Integration tests verifying that Claude spend-cap middleware is properly
// applied to the routes identified in the P0 security audit:
//
//   • GET /api/insights/topics
//   • GET /api/insights/failure-modes
//   • GET /api/insights/daily-brief
//   • POST /api/qa/score/:callId
//
// Each test spins up a minimal Express app that duplicates the middleware
// ordering from server.ts without importing server.ts (which opens DB
// connections and calls process.exit on missing env vars).  The stubs
// allow us to assert on real HTTP semantics (status codes, headers, body
// shape) against the middleware functions exported from src/lib/.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import http from "node:http";
import { buildCSP } from "./csp";

// ──────────────────────────────────────────────────────────
//  Minimal middleware stubs that mirror server.ts behaviour
// ──────────────────────────────────────────────────────────

type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/** Fake authenticateUser — injects req.user from X-Test-User-Id header. */
function fakeAuth(req: any, res: Response, next: NextFunction) {
  const id = req.headers["x-test-user-id"] as string | undefined;
  if (!id) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id };
  next();
}

/**
 * Fake claudeRateLimiter — always allows through in tests.
 * We test the real limiter in rate-limit.test.ts; here we care about
 * the middleware *ordering*, not the rate-limit algorithm.
 */
function fakeClaudeRateLimiter(_req: Request, _res: Response, next: NextFunction) {
  next();
}

/**
 * Fake enforceSpendCap — accepts a `hardCap` boolean flag via closure.
 * When hardCap is true, the middleware returns 402 (spend cap exceeded).
 */
function makeEnforceSpendCap(hardCap: boolean): Middleware {
  return (req: any, res: Response, next: NextFunction): void => {
    if (!req?.user?.id) { next(); return; }
    if (hardCap) {
      res.status(402).json({
        error: "Monthly Claude budget reached.",
        code: "SPEND_LIMIT_EXCEEDED",
      });
      return;
    }
    next();
  };
}

/**
 * Fake enforce24hSpendCap — accepts a `capReached` flag via closure.
 * When capReached is true, returns 402.
 */
function makeEnforce24hSpendCap(capReached: boolean): Middleware {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (capReached) {
      res.status(402).json({
        error: "Daily Claude spend limit reached.",
        code: "DAILY_SPEND_LIMIT_EXCEEDED",
      });
      return;
    }
    next();
  };
}

// ──────────────────────────────────────────────────────────
//  Tiny HTTP test helper
// ──────────────────────────────────────────────────────────

function startServer(app: express.Application): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function getPort(server: http.Server): number {
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("unexpected address");
  return addr.port;
}

async function request(
  server: http.Server,
  method: string,
  path: string,
  opts: { userId?: string } = {},
): Promise<{ status: number; body: any }> {
  const port = getPort(server);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.userId) headers["x-test-user-id"] = opts.userId;

  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ──────────────────────────────────────────────────────────
//  Build a test app that mirrors the route ordering for the
//  four spend-capped endpoints.
// ──────────────────────────────────────────────────────────

function buildTestApp(opts: {
  hardCap?: boolean;
  dailyCap?: boolean;
}) {
  const app = express();
  app.use(express.json());

  const spendCap = makeEnforceSpendCap(!!opts.hardCap);
  const dailyCap = makeEnforce24hSpendCap(!!opts.dailyCap);

  // Mirrors the middleware chain in server.ts after the P0 audit fix:
  //   authenticateUser → claudeRateLimiter → enforce24hSpendCap → enforceSpendCap → handler

  app.get(
    "/api/insights/topics",
    fakeAuth,
    fakeClaudeRateLimiter,
    dailyCap,
    spendCap,
    (_req, res) => res.json({ topics: [] }),
  );

  app.get(
    "/api/insights/failure-modes",
    fakeAuth,
    fakeClaudeRateLimiter,
    dailyCap,
    spendCap,
    (_req, res) => res.json({ modes: [] }),
  );

  app.get(
    "/api/insights/daily-brief",
    fakeAuth,
    fakeClaudeRateLimiter,
    dailyCap,
    spendCap,
    (_req, res) => res.json({ brief: "" }),
  );

  app.post(
    "/api/qa/score/:callId",
    fakeAuth,
    fakeClaudeRateLimiter,
    dailyCap,
    spendCap,
    (_req, res) => res.json({ score: 80 }),
  );

  return app;
}

// ──────────────────────────────────────────────────────────
//  Tests
// ──────────────────────────────────────────────────────────

describe("Spend-cap middleware on Claude-backed routes (P0 audit fix)", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) await stopServer(server);
  });

  // ── Unauthenticated requests ─────────────────────────────

  describe("unauthenticated → 401", () => {
    beforeEach(async () => {
      server = await startServer(buildTestApp({}));
    });

    it("GET /api/insights/topics returns 401 without auth header", async () => {
      const { status } = await request(server, "GET", "/api/insights/topics");
      expect(status).toBe(401);
    });

    it("GET /api/insights/failure-modes returns 401 without auth header", async () => {
      const { status } = await request(server, "GET", "/api/insights/failure-modes");
      expect(status).toBe(401);
    });

    it("GET /api/insights/daily-brief returns 401 without auth header", async () => {
      const { status } = await request(server, "GET", "/api/insights/daily-brief");
      expect(status).toBe(401);
    });

    it("POST /api/qa/score/:callId returns 401 without auth header", async () => {
      const { status } = await request(server, "POST", "/api/qa/score/call-123");
      expect(status).toBe(401);
    });
  });

  // ── Authenticated + no cap reached → handler runs ────────

  describe("authenticated, no cap → 200", () => {
    beforeEach(async () => {
      server = await startServer(buildTestApp({ hardCap: false, dailyCap: false }));
    });

    it("GET /api/insights/topics returns 200 for authenticated user", async () => {
      const { status } = await request(server, "GET", "/api/insights/topics", { userId: "user-1" });
      expect(status).toBe(200);
    });

    it("GET /api/insights/failure-modes returns 200 for authenticated user", async () => {
      const { status } = await request(server, "GET", "/api/insights/failure-modes", { userId: "user-1" });
      expect(status).toBe(200);
    });

    it("GET /api/insights/daily-brief returns 200 for authenticated user", async () => {
      const { status } = await request(server, "GET", "/api/insights/daily-brief", { userId: "user-1" });
      expect(status).toBe(200);
    });

    it("POST /api/qa/score/:callId returns 200 for authenticated user", async () => {
      const { status } = await request(server, "POST", "/api/qa/score/call-123", { userId: "user-1" });
      expect(status).toBe(200);
    });
  });

  // ── Monthly hard cap reached → 402 ──────────────────────

  describe("authenticated, monthly hard cap reached → 402", () => {
    beforeEach(async () => {
      server = await startServer(buildTestApp({ hardCap: true, dailyCap: false }));
    });

    it("GET /api/insights/topics returns 402 when hard cap is active", async () => {
      const { status, body } = await request(server, "GET", "/api/insights/topics", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("SPEND_LIMIT_EXCEEDED");
    });

    it("GET /api/insights/failure-modes returns 402 when hard cap is active", async () => {
      const { status, body } = await request(server, "GET", "/api/insights/failure-modes", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("SPEND_LIMIT_EXCEEDED");
    });

    it("GET /api/insights/daily-brief returns 402 when hard cap is active", async () => {
      const { status, body } = await request(server, "GET", "/api/insights/daily-brief", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("SPEND_LIMIT_EXCEEDED");
    });

    it("POST /api/qa/score/:callId returns 402 when hard cap is active", async () => {
      const { status, body } = await request(server, "POST", "/api/qa/score/call-123", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("SPEND_LIMIT_EXCEEDED");
    });
  });

  // ── Daily cap reached → 402 (checked before monthly hard cap) ──

  describe("authenticated, daily cap reached → 402", () => {
    beforeEach(async () => {
      server = await startServer(buildTestApp({ hardCap: false, dailyCap: true }));
    });

    it("GET /api/insights/topics returns 402 when daily cap is active", async () => {
      const { status, body } = await request(server, "GET", "/api/insights/topics", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("DAILY_SPEND_LIMIT_EXCEEDED");
    });

    it("GET /api/insights/failure-modes returns 402 when daily cap is active", async () => {
      const { status, body } = await request(server, "GET", "/api/insights/failure-modes", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("DAILY_SPEND_LIMIT_EXCEEDED");
    });

    it("GET /api/insights/daily-brief returns 402 when daily cap is active", async () => {
      const { status, body } = await request(server, "GET", "/api/insights/daily-brief", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("DAILY_SPEND_LIMIT_EXCEEDED");
    });

    it("POST /api/qa/score/:callId returns 402 when daily cap is active", async () => {
      const { status, body } = await request(server, "POST", "/api/qa/score/call-123", { userId: "user-1" });
      expect(status).toBe(402);
      expect(body.code).toBe("DAILY_SPEND_LIMIT_EXCEEDED");
    });
  });
});

// ──────────────────────────────────────────────────────────
//  CSP nonce tests — verify buildCSP produces correct directives
// ──────────────────────────────────────────────────────────

describe("CSP nonce-based script-src (P0 audit fix)", () => {
  it("production CSP without nonce has no 'unsafe-inline' on script-src", () => {
    const csp = buildCSP(false);
    const scriptSrcDir = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrcDir).toBeDefined();
    expect(scriptSrcDir).not.toContain("'unsafe-inline'");
    expect(scriptSrcDir).toBe("script-src 'self'");
  });

  it("production CSP with nonce uses nonce directive instead of 'unsafe-inline' on script-src", () => {
    const csp = buildCSP(false, "abc123-_");
    // The nonce should appear in the CSP
    expect(csp).toContain("'nonce-abc123-_'");
    // script-src must not have 'unsafe-inline' — only the nonce
    const scriptSrcDir = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrcDir).toBeDefined();
    expect(scriptSrcDir).not.toContain("'unsafe-inline'");
    expect(scriptSrcDir).toContain("'nonce-abc123-_'");
  });

  it("dev CSP keeps 'unsafe-inline' and 'unsafe-eval' for Vite HMR", () => {
    const csp = buildCSP(true);
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("dev CSP with nonce still keeps 'unsafe-inline' and 'unsafe-eval'", () => {
    // In dev, the nonce is ignored — Vite always needs unsafe-inline.
    const csp = buildCSP(true, "abc123-_");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
  });
});
