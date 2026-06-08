import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../../tests/helpers/express-test-app";

const mocks = vi.hoisted(() => ({
  xOAuthConfigured: vi.fn(),
  generatePkcePair: vi.fn(() => ({ verifier: "pkce-verifier", challenge: "pkce-challenge" })),
  getXAuthUrl: vi.fn(
    () => "https://twitter.com/i/oauth2/authorize?client_id=test&code_challenge=pkce-challenge",
  ),
  exchangeXCode: vi.fn(),
  fetchXUserProfile: vi.fn(),
  disconnectX: vi.fn(),
  drizzle: {
    insert: vi.fn(),
  },
}));

vi.mock("../../lib/server-context", () => ({
  drizzle: mocks.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  IS_PROD: false,
}));

vi.mock("../../middleware/auth", () => ({
  authenticateUser: vi.fn((req: express.Request, _res, next) => {
    (req as express.Request & { user?: { id: string } }).user = { id: "tenant-user-1" };
    next();
  }),
}));

vi.mock("../../middleware/rate-limit-middleware", () => ({
  oauthRateLimiter: vi.fn((_req, _res, next) => next()),
}));

vi.mock("../../lib/oauth-helpers", () => ({
  generateOAuthState: vi.fn(() => "signed-state"),
  verifyOAuthState: vi.fn(() => ({
    ok: true,
    userId: "tenant-user-1",
    pkceVerifier: "pkce-verifier",
  })),
  resolveUserIdFromOAuthSession: vi.fn(),
}));

vi.mock("../../lib/x-service", () => ({
  xOAuthConfigured: mocks.xOAuthConfigured,
  generatePkcePair: mocks.generatePkcePair,
  getXAuthUrl: mocks.getXAuthUrl,
  exchangeXCode: mocks.exchangeXCode,
  fetchXUserProfile: mocks.fetchXUserProfile,
  disconnectX: mocks.disconnectX,
}));

async function buildApp() {
  vi.resetModules();
  const mod = await import("./x");
  const app = express();
  mountRouteTestRequestContext(app);
  app.use(mod.default);
  mountTestErrorHandler(app);
  return app;
}

describe("X OAuth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = "https://trywireline.com";
    mocks.xOAuthConfigured.mockReturnValue(true);
    mocks.exchangeXCode.mockResolvedValue({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 7200,
    });
    mocks.fetchXUserProfile.mockResolvedValue({
      id: "123",
      username: "wireline",
      name: "Wireline",
    });
    mocks.drizzle.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it("GET /api/oauth/x/url returns 500 when not configured", async () => {
    mocks.xOAuthConfigured.mockReturnValue(false);
    const app = await buildApp();
    const res = await request(app).get("/api/oauth/x/url");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/X_CLIENT_ID/i);
  });

  it("GET /api/oauth/x/url returns authorization URL with PKCE", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/oauth/x/url");
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("twitter.com");
    expect(mocks.generatePkcePair).toHaveBeenCalled();
    expect(mocks.getXAuthUrl).toHaveBeenCalledWith(
      "https://trywireline.com/api/oauth/x/callback",
      "signed-state",
      "pkce-challenge",
    );
  });

  it("GET /api/oauth/x/callback rejects missing PKCE verifier in state", async () => {
    const { verifyOAuthState } = await import("../../lib/oauth-helpers");
    vi.mocked(verifyOAuthState).mockReturnValueOnce({ ok: true, userId: "tenant-user-1" });
    const app = await buildApp();
    const res = await request(app).get("/api/oauth/x/callback?code=abc&state=bad");
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/PKCE verifier/i);
  });

  it("POST /api/oauth/x/disconnect calls disconnectX", async () => {
    mocks.disconnectX.mockResolvedValue(undefined);
    const app = await buildApp();
    const res = await request(app).post("/api/oauth/x/disconnect");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.disconnectX).toHaveBeenCalledWith("tenant-user-1");
  });
});
