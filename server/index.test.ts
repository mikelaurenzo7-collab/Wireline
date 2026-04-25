import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createApp", () => {
  describe("non-production (default test env)", () => {
    let app: ReturnType<typeof import("./index").createApp>;

    beforeEach(async () => {
      vi.resetModules();
      const { createApp } = await import("./index");
      app = createApp();
    });

    describe("security headers", () => {
      it("sets the helmet defaults we rely on", async () => {
        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        // helmet defaults
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-frame-options"]).toBe("DENY");
        expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
        expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
        expect(res.headers["x-dns-prefetch-control"]).toBe("off");
        expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
        // X-Powered-By: Express must be removed.
        expect(res.headers["x-powered-by"]).toBeUndefined();
      });

      it("does not enable CSP outside production (Vite HMR needs unsafe-eval)", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["content-security-policy"]).toBeUndefined();
      });

      it("Permissions-Policy allows first-party microphone for Vapi voice calls", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["permissions-policy"]).toBe(
          "camera=(), microphone=(self), geolocation=()"
        );
      });
    });

    describe("liveness/readiness", () => {
      it("/health returns ok", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok" });
      });

      it("/ready reports configured services", async () => {
        const res = await request(app).get("/ready");
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ready");
        expect(res.body.services).toBeDefined();
      });
    });
  });

  describe("production", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      vi.resetModules();
      // env.ts reads `isProduction` once at import time; remount with prod set.
      process.env.NODE_ENV = "production";
      // Production env schema requires these; provide stub values so the
      // module-load env validation doesn't `process.exit(1)` under test.
      process.env.APP_URL = process.env.APP_URL ?? "https://example.test";
      process.env.SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";
      process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "test-gemini-key";
      process.env.WIRELINE_WEBHOOK_SECRET =
        process.env.WIRELINE_WEBHOOK_SECRET ?? "0123456789abcdef0123456789abcdef";
      process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
      process.env.GOOGLE_CLIENT_SECRET =
        process.env.GOOGLE_CLIENT_SECRET ?? "test-client-secret";
      process.env.OAUTH_STATE_SECRET =
        process.env.OAUTH_STATE_SECRET ?? "0123456789abcdef0123456789abcdef";
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      vi.resetModules();
    });

    it("ships an enforced CSP that allowlists Supabase, Vapi, Daily, and Google Fonts", async () => {
      const { createApp } = await import("./index");
      const app = createApp();
      const res = await request(app).get("/health");

      const csp = res.headers["content-security-policy"];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("https://*.supabase.co");
      expect(csp).toContain("wss://*.supabase.co");
      expect(csp).toContain("https://api.vapi.ai");
      expect(csp).toContain("https://*.daily.co");
      expect(csp).toContain("https://fonts.googleapis.com");
      expect(csp).toContain("https://fonts.gstatic.com");
      expect(csp).toContain("upgrade-insecure-requests");
    });
  });
});

