import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./index";

describe("createApp", () => {
  const app = createApp();

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
      // Custom Permissions-Policy preserved verbatim.
      expect(res.headers["permissions-policy"]).toBe(
        "camera=(), microphone=(), geolocation=()"
      );
    });

    it("does not enable a Content-Security-Policy yet (separate PR)", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["content-security-policy"]).toBeUndefined();
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
