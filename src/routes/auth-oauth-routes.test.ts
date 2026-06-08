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
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";
import http from "http";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "net";
import { OAUTH_BRIDGE_STATE_COOKIE } from "../lib/oauth-bridge-cookie";

const mocks = vi.hoisted(() => ({
  drizzle: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
  googleUserInfoGet: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  startTrialForUser: vi.fn(),
}));

vi.mock("googleapis", () => {
  class OAuth2Mock {
    private clientId: string;
    private redirectUri: string;

    constructor(clientId: string, _clientSecret: string, redirectUri: string) {
      this.clientId = clientId;
      this.redirectUri = redirectUri;
    }

    generateAuthUrl(opts: { scope?: string[]; state?: string; prompt?: string }) {
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        state: opts.state || "",
        scope: (opts.scope || []).join(" "),
      });
      if (opts.prompt) params.set("prompt", opts.prompt);
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    async getToken() {
      return { tokens: { access_token: "provider-access-token" } };
    }

    setCredentials() {
      return undefined;
    }
  }

  return {
    google: {
      auth: { OAuth2: OAuth2Mock },
      oauth2: () => ({ userinfo: { get: mocks.googleUserInfoGet } }),
    },
  };
});

// Mock server-context (drizzle + log) so the route module loads without
// a real database connection.
vi.mock("../lib/server-context", () => ({
  drizzle: mocks.drizzle,
  log: mocks.log,
}));

vi.mock("../lib/trial-gate", () => ({
  startTrialForUser: mocks.startTrialForUser,
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
  vi.resetModules();
  const mod = await import("./auth-oauth-routes");
  const app = express();
  mountRouteTestRequestContext(app);
  app.use(express.json());
  app.use(mod.default);
  mountTestErrorHandler(app);
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

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("OAuth /url endpoints", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.googleUserInfoGet.mockResolvedValue({
      data: { email: "oauth-user@example.test", name: "OAuth User" },
    });
    mocks.startTrialForUser.mockResolvedValue(undefined);
    mocks.drizzle.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    // Reset provider env vars before each test so they don't leak.
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.YAHOO_CLIENT_ID;
    delete process.env.YAHOO_CLIENT_SECRET;
    delete process.env.APP_URL;
    process.env.OAUTH_BRIDGE_SECRET = "test-oauth-bridge-secret";
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
        await closeServer(server);
      }
    }, 30_000);

    it("Microsoft: returns 503 JSON instead of HTML", async () => {
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/microsoft/url`);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toMatch(/Microsoft sign-in is not configured/i);
      } finally {
        await closeServer(server);
      }
    }, 30_000);

    it("Yahoo: returns 503 JSON instead of HTML", async () => {
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/yahoo/url`);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toMatch(/Yahoo sign-in is not configured/i);
      } finally {
        await closeServer(server);
      }
    }, 30_000);
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
        await closeServer(server);
      }
    }, 30_000);

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
        await closeServer(server);
      }
    }, 30_000);

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
        await closeServer(server);
      }
    }, 30_000);
  });

  describe("callback session bridge", () => {
    it("repairs a missing pending-code table before redirecting to the SPA", async () => {
      process.env.APP_URL = "https://example.test";
      process.env.GOOGLE_CLIENT_ID = "google-test-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";

      const userId = "af36620d-047e-4521-a726-8507d25444fd";
      const bridgeState = "test-bridge-state-value";
      mocks.drizzle.select.mockReturnValue({
        from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue([]) }) }),
      });

      const pendingValues = vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('relation "wireline_oauth_pending_codes" does not exist'), {
            code: "42P01",
          }),
        )
        .mockResolvedValueOnce(undefined);

      mocks.drizzle.insert
        .mockImplementationOnce(() => ({
          values: () => ({
            returning: vi
              .fn()
              .mockResolvedValue([
                { id: userId, email: "oauth-user@example.test", fullName: "OAuth User" },
              ]),
          }),
        }))
        .mockImplementation(() => ({ values: pendingValues }));
      mocks.drizzle.execute.mockResolvedValue(undefined);

      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(
          `${url}/api/auth/google/callback?code=provider-code&state=test-state`,
          {
            redirect: "manual",
            headers: { Cookie: `${OAUTH_BRIDGE_STATE_COOKIE}=${bridgeState}` },
          },
        );
        expect(res.status).toBe(302);
        const location = res.headers.get("location") || "";
        expect(location).toMatch(/^https:\/\/example\.test\/auth\/oauth-complete\?code=/);
        expect(location).not.toContain("Failed");
        // ensurePendingCodeSchema runs four DDL statements: CREATE TABLE,
        // ALTER ADD bridge_state, CREATE INDEX, and the RLS-lockdown DO block.
        expect(mocks.drizzle.execute).toHaveBeenCalledTimes(6);
        expect(pendingValues).toHaveBeenCalledTimes(2);
        expect(pendingValues).toHaveBeenLastCalledWith(
          expect.objectContaining({
            bridgeStateHash: createHmac("sha256", process.env.OAUTH_BRIDGE_SECRET!)
              .update(bridgeState)
              .digest("hex"),
          }),
        );
        expect(mocks.log.warn).toHaveBeenCalledWith(
          "auth oauth: pending-code schema missing; repairing before retry",
          expect.objectContaining({ code: "42P01" }),
        );
      } finally {
        await closeServer(server);
      }
    }, 30_000);

    it("redirects with error when bridge cookie is missing on callback", async () => {
      process.env.APP_URL = "https://example.test";
      process.env.GOOGLE_CLIENT_ID = "google-test-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";
      mocks.drizzle.select.mockReturnValue({
        from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue([]) }) }),
      });
      mocks.drizzle.insert.mockImplementation(() => ({
        values: () => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: "af36620d-047e-4521-a726-8507d25444fd",
              email: "oauth-user@example.test",
              fullName: "OAuth User",
            },
          ]),
        }),
      }));

      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(
          `${url}/api/auth/google/callback?code=provider-code&state=test-state`,
          { redirect: "manual" },
        );
        expect(res.status).toBe(302);
        const location = decodeURIComponent(res.headers.get("location") || "");
        expect(location).toContain("Sign-in session expired");
      } finally {
        await closeServer(server);
      }
    }, 30_000);
  });

  describe("POST /api/auth/oauth/exchange", () => {
    const bridgeState = "bridge-for-exchange-test";
    const pendingCode = "one-time-code-abc";

    function mockConsumeRow(overrides?: { bridge_state?: string | null }) {
      const state = overrides?.bridge_state ?? bridgeState;
      mocks.drizzle.execute.mockResolvedValue({
        rows: [
          {
            code_hash: createHmac("sha256", process.env.OAUTH_BRIDGE_SECRET!)
              .update(pendingCode)
              .digest("hex"),
            user_id: "af36620d-047e-4521-a726-8507d25444fd",
            email: "oauth-user@example.test",
            full_name: "OAuth User",
            is_owner: false,
            bridge_state_hash: state
              ? createHmac("sha256", process.env.OAUTH_BRIDGE_SECRET!).update(state).digest("hex")
              : null,
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      });
    }

    it("rejects exchange without bridge cookie", async () => {
      mockConsumeRow();
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/oauth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pendingCode }),
        });
        expect(res.status).toBe(400);
      } finally {
        await closeServer(server);
      }
    }, 30_000);

    it("rejects exchange when bridge cookie does not match", async () => {
      mockConsumeRow();
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/oauth/exchange`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${OAUTH_BRIDGE_STATE_COOKIE}=wrong-state`,
          },
          body: JSON.stringify({ code: pendingCode }),
        });
        expect(res.status).toBe(400);
      } finally {
        await closeServer(server);
      }
    }, 30_000);

    it("succeeds when bridge cookie matches stored state", async () => {
      mockConsumeRow();
      const app = await buildApp();
      const { server, url } = await listen(app);
      try {
        const res = await fetch(`${url}/api/auth/oauth/exchange`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${OAUTH_BRIDGE_STATE_COOKIE}=${bridgeState}`,
          },
          body: JSON.stringify({ code: pendingCode }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.email).toBe("oauth-user@example.test");
      } finally {
        await closeServer(server);
      }
    }, 30_000);
  });
});
