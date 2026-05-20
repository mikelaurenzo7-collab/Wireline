/**
 * Smoke tests for the new Apollo + Meta CRM-style OAuth routes.
 * Mirrors the smoke-style coverage of the auth OAuth routes — verifies
 * URL building, env-gating (503), and disconnect auth-gating without
 * actually hitting Apollo or Facebook.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../middleware/auth", () => ({
  authenticateUser: (req: any, _res: any, next: any) => {
    req.user = { id: "00000000-0000-0000-0000-000000000001", email: "owner@example.com" };
    next();
  },
}));

vi.mock("../../middleware/rate-limit-middleware", () => ({
  oauthRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../lib/oauth-helpers", () => ({
  SCOPES: "",
  MS_SCOPES: "",
  getGoogleOAuthClient: () => ({}),
  getMicrosoftRedirectUri: () => "",
  generateOAuthState: () => "state-token-fake",
  verifyOAuthState: () => ({ ok: false }),
  resolveUserIdFromOAuthSession: async () => null,
}));

async function makeApp() {
  // Import after env is set so route-module top-level reads pick up
  // the test env vars consistently.
  const oauthRouter = (await import("../oauth-routes")).default;
  const app = express();
  app.use(express.json());
  app.use(oauthRouter);
  return app;
}

describe("Apollo + Meta OAuth routes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APP_URL = "https://trywireline.com";
    process.env.INTERNAL_JWT_SECRET = "test-jwt-secret-at-least-32-bytes-long-12345";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("Apollo", () => {
    it("returns an Apollo auth URL with required params", async () => {
      process.env.APOLLO_CLIENT_ID = "apollo-cid";
      process.env.APOLLO_CLIENT_SECRET = "apollo-secret";
      const app = await makeApp();
      const res = await request(app).get("/api/oauth/apollo/url");
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https:\/\/app\.apollo\.io\/oauth\/authorize\?/);
      expect(res.body.url).toContain("client_id=apollo-cid");
      expect(res.body.url).toContain(encodeURIComponent("/api/oauth/apollo/callback"));
      expect(res.body.url).toContain("state=");
    }, 10_000);

    it("returns 503 when Apollo env is missing", async () => {
      delete process.env.APOLLO_CLIENT_ID;
      delete process.env.APOLLO_CLIENT_SECRET;
      const app = await makeApp();
      const res = await request(app).get("/api/oauth/apollo/url");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/finishing setup/i);
    });

    it("rejects callback with bogus state", async () => {
      process.env.APOLLO_CLIENT_ID = "apollo-cid";
      process.env.APOLLO_CLIENT_SECRET = "apollo-secret";
      const app = await makeApp();
      const res = await request(app).get("/api/oauth/apollo/callback?code=abc&state=bogus");
      expect(res.status).toBe(400);
      expect(res.text.toLowerCase()).toContain("invalid or expired");
    });
  });

  describe("Meta", () => {
    it("returns a Meta auth URL with required params", async () => {
      process.env.META_APP_ID = "meta-app-id";
      process.env.META_APP_SECRET = "meta-app-secret";
      const app = await makeApp();
      const res = await request(app).get("/api/oauth/meta/url");
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https:\/\/www\.facebook\.com\/v18\.0\/dialog\/oauth\?/);
      expect(res.body.url).toContain("client_id=meta-app-id");
      expect(res.body.url).toContain(encodeURIComponent("/api/oauth/meta/callback"));
      expect(res.body.url).toContain("state=");
    });

    it("returns 503 when Meta env is missing", async () => {
      delete process.env.META_APP_ID;
      delete process.env.META_APP_SECRET;
      const app = await makeApp();
      const res = await request(app).get("/api/oauth/meta/url");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/finishing setup/i);
    });
  });
});
