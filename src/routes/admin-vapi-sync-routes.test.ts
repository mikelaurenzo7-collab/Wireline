import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountTestErrorHandler } from "../../tests/helpers/express-test-app";

const h = vi.hoisted(() => ({
  user: { id: "user-1", email: "admin@example.com" },
  isPlatformAdmin: vi.fn(),
  log: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../middleware/auth", () => ({
  authenticateUser: vi.fn(
    (req: Request & { user?: typeof h.user }, _res: Response, next: NextFunction) => {
      req.user = h.user;
      next();
    },
  ),
}));

vi.mock("../middleware/platform-admin", () => ({
  isPlatformAdmin: h.isPlatformAdmin,
}));

vi.mock("../lib/server-context", () => ({
  log: h.log,
}));

import adminVapiSyncRoutes from "./admin-vapi-sync-routes";

function createApp() {
  const app = express();
  app.use(adminVapiSyncRoutes);
  mountTestErrorHandler(app);
  return app;
}

describe("admin Vapi sync route authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MIGRATION_TOKEN;
    delete process.env.VAPI_PRIVATE_KEY;
  });

  it("returns a fail-closed 500 when platform-admin lookup fails", async () => {
    h.isPlatformAdmin.mockRejectedValueOnce(new Error("database unavailable"));

    const res = await request(createApp())
      .post("/api/admin/sync-vapi-knowledge")
      .set("Authorization", "******");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "Authorization check failed",
      code: "INTERNAL_ERROR",
      requestId: "test-request-id",
    });
    expect(h.log.error).toHaveBeenCalledWith(
      "[admin-vapi-sync] platform-admin check failed",
      expect.objectContaining({ error: "database unavailable" }),
    );
  });

  it("returns a standardized 403 when caller is not a platform admin", async () => {
    h.isPlatformAdmin.mockResolvedValueOnce(false);

    const res = await request(createApp())
      .post("/api/admin/sync-vapi-knowledge")
      .set("Authorization", "******");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "Platform admin access required",
      code: "FORBIDDEN",
      requestId: "test-request-id",
    });
  });

  it("keeps migration-token auth from depending on platform-admin lookup", async () => {
    process.env.MIGRATION_TOKEN = "secret-token";

    const res = await request(createApp())
      .post("/api/admin/sync-vapi-knowledge")
      .set("X-Migration-Token", "secret-token");

    expect(h.isPlatformAdmin).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "VAPI_PRIVATE_KEY not configured",
      code: "SERVICE_UNAVAILABLE",
      requestId: "test-request-id",
    });
  });
});
