/**
 * Smoke coverage for the OAuth sign-in routes. We don't mock the
 * external providers (Google / Microsoft / Yahoo) — instead we verify
 * the routes wire up correctly, gate on env vars, and produce
 * well-formed authorization URLs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import authOAuthRouter from "../auth-oauth-routes";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authOAuthRouter);
  return app;
}

describe("auth oauth sign-in routes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.MICROSOFT_CLIENT_ID = "ms-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "ms-secret";
    process.env.YAHOO_CLIENT_ID = "yahoo-client-id";
    process.env.YAHOO_CLIENT_SECRET = "yahoo-secret";
    process.env.OAUTH_STATE_SECRET = "test-state-secret-at-least-32-bytes-long";
    process.env.APP_URL = "https://trywireline.com";
    process.env.INTERNAL_JWT_SECRET = "test-jwt-secret-at-least-32-bytes-long-12345";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("GET /api/auth/:provider/url", () => {
    it("returns a Google auth URL with required params", async () => {
      const res = await request(makeApp()).get("/api/auth/google/url");
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
      expect(res.body.url).toContain("client_id=google-client-id");
      expect(res.body.url).toContain(encodeURIComponent("/api/auth/google/callback"));
      expect(res.body.url).toContain("state=");
    });

    it("returns a Microsoft auth URL with required params", async () => {
      const res = await request(makeApp()).get("/api/auth/microsoft/url");
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(
        /^https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize\?/,
      );
      expect(res.body.url).toContain("client_id=ms-client-id");
      expect(res.body.url).toContain(encodeURIComponent("/api/auth/microsoft/callback"));
    });

    it("returns a Yahoo auth URL with required params", async () => {
      const res = await request(makeApp()).get("/api/auth/yahoo/url");
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https:\/\/api\.login\.yahoo\.com\/oauth2\/request_auth\?/);
      expect(res.body.url).toContain("client_id=yahoo-client-id");
      expect(res.body.url).toContain(encodeURIComponent("/api/auth/yahoo/callback"));
    });

    it("returns 503 when Google env is missing", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const res = await request(makeApp()).get("/api/auth/google/url");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/not configured/i);
    });

    it("returns 503 when Microsoft env is missing", async () => {
      delete process.env.MICROSOFT_CLIENT_SECRET;
      const res = await request(makeApp()).get("/api/auth/microsoft/url");
      expect(res.status).toBe(503);
    });

    it("returns 503 when Yahoo env is missing", async () => {
      delete process.env.YAHOO_CLIENT_ID;
      const res = await request(makeApp()).get("/api/auth/yahoo/url");
      expect(res.status).toBe(503);
    });
  });

  describe("callback bridge", () => {
    it("redirects to /auth/oauth-complete with an error when state is invalid", async () => {
      const res = await request(makeApp()).get("/api/auth/google/callback?code=abc&state=bogus");
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/auth/oauth-complete?error=");
      expect(decodeURIComponent(res.headers.location)).toContain("Invalid or expired");
    });

    it("redirects with an error when no code is present (Yahoo)", async () => {
      const urlRes = await request(makeApp()).get("/api/auth/yahoo/url");
      const url = new URL(urlRes.body.url);
      const state = url.searchParams.get("state") ?? "";
      const res = await request(makeApp()).get(`/api/auth/yahoo/callback?state=${state}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("/auth/oauth-complete?error=");
    });
  });
});
