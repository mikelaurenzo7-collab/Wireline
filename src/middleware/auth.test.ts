import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyInternalJwt: vi.fn(),
  requireInternalJwtSecret: vi.fn(() => "test-secret-key-at-least-32-chars-long"),
  getSessionTokenFromRequest: vi.fn(),
  auditLogAuth: vi.fn().mockResolvedValue(undefined),
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
  auditLogger: {
    logAuth: mocks.auditLogAuth,
  },
  tenantStore: {
    getStore: () => undefined,
    run: (_id: string, fn: () => unknown) => fn(),
  },
}));

import { authenticateUser } from "./auth";

describe("authenticateUser", () => {
  const prevJwtSecret = process.env.INTERNAL_JWT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_JWT_SECRET = "test-secret-key-at-least-32-chars-long";
    mocks.requireInternalJwtSecret.mockImplementation(
      () => "test-secret-key-at-least-32-chars-long",
    );
    mocks.getSessionTokenFromRequest.mockReturnValue(undefined);
    mocks.verifyInternalJwt.mockResolvedValue({
      sub: "user-abc",
      email: "ops@example.com",
      aud: "authenticated",
      role: "authenticated",
      iat: Math.floor(Date.now() / 1000),
    });
  });

  afterEach(() => {
    if (prevJwtSecret === undefined) delete process.env.INTERNAL_JWT_SECRET;
    else process.env.INTERNAL_JWT_SECRET = prevJwtSecret;
  });

  function app() {
    const a = express();
    a.use(express.json());
    a.get("/protected", authenticateUser, (req, res) => {
      res.json({ userId: (req as { user?: { id: string } }).user?.id });
    });
    return a;
  }

  it("returns 401 when no session token is present", async () => {
    const res = await request(app()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/No authorization token/i);
    expect(mocks.verifyInternalJwt).not.toHaveBeenCalled();
  });

  it("returns 503 when JWT secret is not configured", async () => {
    mocks.getSessionTokenFromRequest.mockReturnValue("session-jwt");
    mocks.requireInternalJwtSecret.mockImplementation(() => {
      throw new Error("JWT_SECRET_NOT_CONFIGURED");
    });
    const res = await request(app()).get("/protected");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("returns 401 for invalid or expired tokens", async () => {
    mocks.getSessionTokenFromRequest.mockReturnValue("bad-jwt");
    mocks.verifyInternalJwt.mockResolvedValue(null);
    const res = await request(app()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired session/i);
    expect(mocks.auditLogAuth).toHaveBeenCalled();
  });

  it("attaches user and continues when token is valid", async () => {
    mocks.getSessionTokenFromRequest.mockReturnValue("good-jwt");
    const res = await request(app()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("user-abc");
    expect(mocks.verifyInternalJwt).toHaveBeenCalledWith(
      "good-jwt",
      "test-secret-key-at-least-32-chars-long",
    );
  });

  it("is idempotent when user is already attached", async () => {
    const a = express();
    a.use((req, _res, next) => {
      (req as { user?: { id: string } }).user = { id: "already-set" } as never;
      next();
    });
    a.get("/protected", authenticateUser, (req, res) => {
      res.json({ userId: (req as { user?: { id: string } }).user?.id });
    });
    const res = await request(a).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("already-set");
    expect(mocks.verifyInternalJwt).not.toHaveBeenCalled();
  });
});
