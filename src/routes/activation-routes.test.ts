import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middleware/auth", () => ({
  authenticateUser: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user: { id: string } }).user = { id: "user-1" };
    next();
  },
}));

vi.mock("../lib/tenant-activation", () => ({
  getTenantActivationStatus: vi.fn(async () => ({
    activated: false,
    activatedAt: null,
    timeToActivationSeconds: null,
    activationChannel: null,
    firstActivationCallId: null,
    signupAt: "2026-06-01T00:00:00.000Z",
  })),
}));

import activationRouter from "./activation-routes";
import { getTenantActivationStatus } from "../lib/tenant-activation";

describe("activation-routes", () => {
  const app = express();
  app.use(activationRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/activation/status returns tenant activation payload", async () => {
    const response = await request(app).get("/api/activation/status");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      activated: false,
      signupAt: "2026-06-01T00:00:00.000Z",
    });
    expect(getTenantActivationStatus).toHaveBeenCalledWith("user-1");
  });
});
