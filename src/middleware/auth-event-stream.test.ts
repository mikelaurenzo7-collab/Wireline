import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyInternalJwt: vi.fn(),
  requireInternalJwtSecret: vi.fn(() => "test-secret-key-at-least-32-chars-long"),
  getSessionTokenFromRequest: vi.fn(),
}));

vi.mock("../lib/auth-utils", () => ({
  verifyInternalJwt: mocks.verifyInternalJwt,
}));

vi.mock("../lib/internal-jwt-secret", () => ({
  requireInternalJwtSecret: mocks.requireInternalJwtSecret,
}));

vi.mock("../lib/session-cookie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/session-cookie")>();
  return {
    ...actual,
    getSessionTokenFromRequest: mocks.getSessionTokenFromRequest,
  };
});

vi.mock("../lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  tenantStore: {
    getStore: () => undefined,
    run: (_id: string, fn: () => unknown) => fn(),
  },
}));

import { authenticateEventStream } from "./auth";

describe("authenticateEventStream", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionTokenFromRequest.mockReturnValue(undefined);
    mocks.verifyInternalJwt.mockResolvedValue({
      sub: "user-1",
      email: "person@example.com",
      aud: "authenticated",
      role: "authenticated",
      iat: Math.floor(Date.now() / 1000),
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    delete process.env.VERCEL;
    if (prevVercel !== undefined) process.env.VERCEL = prevVercel;
  });

  function app() {
    const a = express();
    a.get("/sse", authenticateEventStream, (req, res) => {
      res.json({ userId: (req as { user?: { id: string } }).user?.id });
    });
    return a;
  }

  it("rejects ?token= in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    const res = await request(app()).get("/sse?token=legacy-jwt");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SSE_QUERY_TOKEN_DEPRECATED");
    expect(mocks.verifyInternalJwt).not.toHaveBeenCalled();
  });

  it("allows ?token= in development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    const res = await request(app()).get("/sse?token=dev-jwt");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("user-1");
    expect(mocks.verifyInternalJwt).toHaveBeenCalledWith("dev-jwt", expect.any(String));
  });

  it("uses session cookie when present in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    mocks.getSessionTokenFromRequest.mockReturnValue("cookie-jwt");
    const res = await request(app()).get("/sse");
    expect(res.status).toBe(200);
    expect(mocks.verifyInternalJwt).toHaveBeenCalledWith("cookie-jwt", expect.any(String));
  });
});
