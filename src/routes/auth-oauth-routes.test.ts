/**
 * Smoke tests for the OAuth sign-in URL endpoints. Verifies that:
 *   - When provider env vars are absent, the endpoint responds with
 *     503 JSON `{ error: "<Provider> sign-in is not configured." }`
 *     instead of a generic 500 HTML error page. This is what the
 *     client surfaces to the user when sign-in cannot start.
 *   - When env vars are present, the endpoint returns 200 JSON
 *     with a `url` that points at the correct provider.
 *
 * We mock the lightweight collaborators (drizzle, log, auth-service,
 * oauth-helpers) to keep the test hermetic — these routes are pure
 * URL builders and don't touch the database when /url is hit.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Express } from "express";
import http from "http";
import type { AddressInfo } from "net";

// Mock server-context (drizzle + log) so the route module loads without
// a real database connection.
vi.mock("../lib/server-context", () => ({
  drizzle: {},
  log: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}));

// Mock auth-service so we don't pull in JWT secrets at module-load.
vi.mock("../lib/auth-service", () => ({
  generateToken: () => "test-token",
  isOwnerEmail: () => false,
}));

// Mock oauth-helpers so generateOAuthState doesn't need OAUTH_STATE_SECRET
// in prod. Returns a deterministic value.
vi.mock("../lib/oauth-helpers", () => ({
  generateOAuthState: () => "test-state",
  verifyOAuthState: () => ({ ok: true }),
}));

async function buildApp(): Promise<Express> {
  // Importing the route module *after* env mutation lets us toggle
  // configured vs. unconfigured providers per test.
  const mod = await import("./auth-oauth-routes");
  const app = express();
  app.use(mod.default);
  return app;
}

function listen(app: Express): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe("OAuth /url endpoints", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset provider env vars before each test so they don't leak.
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.YAHOO_CLIENT_ID;
    delete process.env.YAHOO_CLIENT_SECRET;
    delete process.env.APP_URL;
  });

  beforeAll(() => {
    // Ensure the route module has a stable origin for URL construction.
    process.env.APP_URL = "https://example.test";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("when provider is NOT configured", () => {
    it("Google: returns 503 JSON instead of HTML", async () => {
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/google/url`);
        expect(res.status).toBe(503);
        expect(res.headers.get("content-type")).toMatch(/application\/json/);
        const body = await res.json();
        expect(body.error).toMatch(/Google sign-in is not configured/i);
      } finally {
        server.close();
      }
    });

    it("Microsoft: returns 503 JSON instead of HTML", async () => {
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/microsoft/url`);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toMatch(/Microsoft sign-in is not configured/i);
      } finally {
        server.close();
      }
    });

    it("Yahoo: returns 503 JSON instead of HTML", async () => {
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/yahoo/url`);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toMatch(/Yahoo sign-in is not configured/i);
      } finally {
        server.close();
      }
    });
  });

  describe("when provider IS configured", () => {
    it("Google: returns 200 with a Google authorization URL", async () => {
      process.env.GOOGLE_CLIENT_ID = "google-test-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/google/url`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.url).toMatch(/^https:\/\/accounts\.google\.com\//);
        expect(body.url).toContain("client_id=google-test-client-id");
        expect(body.url).toContain("state=test-state");
      } finally {
        server.close();
      }
    });

    it("Microsoft: returns 200 with a Microsoft authorization URL", async () => {
      process.env.MICROSOFT_CLIENT_ID = "ms-test-client-id";
      process.env.MICROSOFT_CLIENT_SECRET = "ms-test-secret";
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/microsoft/url`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.url).toMatch(
          /^https:\/\/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/,
        );
        expect(body.url).toContain("client_id=ms-test-client-id");
        expect(body.url).toContain("prompt=select_account");
      } finally {
        server.close();
      }
    });

    it("Yahoo: returns 200 with a Yahoo authorization URL", async () => {
      process.env.YAHOO_CLIENT_ID = "yahoo-test-client-id";
      process.env.YAHOO_CLIENT_SECRET = "yahoo-test-secret";
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/yahoo/url`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.url).toMatch(/^https:\/\/api\.login\.yahoo\.com\/oauth2\/request_auth/);
        expect(body.url).toContain("client_id=yahoo-test-client-id");
      } finally {
        server.close();
      }
    });
  });
});
