import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const provisionTenantNumber = vi.fn();

vi.mock("../lib/phone-provisioning", () => ({
  provisionTenantNumber: (...args: unknown[]) => provisionTenantNumber(...args),
}));

vi.mock("../middleware/auth", () => ({
  authenticateUser: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: { id: string } }).user = { id: "user-1" };
    next();
  },
}));

vi.mock("../middleware/api-rate-limits", () => ({
  phoneNumberRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const drizzleSelect = vi.fn();

vi.mock("../lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  drizzle: {
    select: (...args: unknown[]) => drizzleSelect(...args),
  },
}));

import carrierRouter from "./carrier-routes";

function mockAgentFound() {
  drizzleSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: "agent-1" }]),
      }),
    }),
  });
}

describe("POST /api/phone-numbers/provision", () => {
  beforeEach(() => {
    provisionTenantNumber.mockReset();
    drizzleSelect.mockReset();
  });

  const app = express();
  app.use(express.json());
  app.use(carrierRouter);

  it("returns provisioned number bound to agent", async () => {
    mockAgentFound();
    provisionTenantNumber.mockResolvedValue({
      ok: true,
      phoneNumber: "+14155550123",
      vapiNumberId: "vapi-uuid",
      reused: false,
    });

    const res = await request(app)
      .post("/api/phone-numbers/provision")
      .send({ agent_id: "agent-1", area_code: "415" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      phone_number: "+14155550123",
      vapi_number_id: "vapi-uuid",
      reused: false,
    });
    expect(provisionTenantNumber).toHaveBeenCalledWith("user-1", {
      agentId: "agent-1",
      areaCode: "415",
      campaignLabel: "fast-start-provision",
    });
  });

  it("rejects invalid area_code", async () => {
    const res = await request(app)
      .post("/api/phone-numbers/provision")
      .send({ agent_id: "agent-1", area_code: "41" });

    expect(res.status).toBe(400);
    expect(provisionTenantNumber).not.toHaveBeenCalled();
  });
});
