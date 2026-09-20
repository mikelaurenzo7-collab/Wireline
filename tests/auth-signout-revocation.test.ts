import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  token: "valid-session" as string | undefined,
  payload: { sub: "user-1", session_version: 3 } as object | null,
  select: vi.fn(),
  update: vi.fn(),
  clearCookie: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({ from: () => ({ where: () => ({ limit: h.select }) }) }),
    update: () => ({ set: () => ({ where: h.update }) }),
  },
  log: { error: vi.fn() },
  tenantStore: { run: (_userId: string, callback: () => unknown) => callback() },
}));
vi.mock("../src/lib/auth-utils", () => ({ verifyInternalJwt: async () => h.payload }));
vi.mock("../src/lib/internal-jwt-secret", () => ({ requireInternalJwtSecret: () => "secret" }));
vi.mock("../src/lib/session-generation", () => ({ isSessionGenerationActive: () => true }));
vi.mock("../src/lib/session-cookie", () => ({
  getSessionTokenFromRequest: () => h.token,
  clearSessionCookie: h.clearCookie,
  setSessionCookie: vi.fn(),
}));
vi.mock("../src/lib/auth-service", () => ({ generateToken: vi.fn(), isOwnerEmail: vi.fn() }));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/rate-limit-middleware", () => ({ migrateSessionRateLimiter: vi.fn() }));
vi.mock("../src/lib/account-service", () => ({ ensureDefaultAccount: vi.fn() }));

import router from "../src/routes/auth-session-hardening-routes";

const handler = router.stack.find((layer) => layer.route?.path === "/api/auth/signout")!.route
  .stack[0].handle;

async function signOut() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({} as Request, res as unknown as Response, vi.fn());
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.token = "valid-session";
  h.payload = { sub: "user-1", session_version: 3 };
  h.select.mockReset().mockResolvedValue([{ id: "user-1", sessionVersion: 3 }]);
  h.update.mockReset().mockResolvedValue(undefined);
});

describe("mounted sign-out revocation", () => {
  it.each(["lookup", "write"])("preserves retry credentials when the DB %s fails", async (at) => {
    (at === "lookup" ? h.select : h.update).mockRejectedValue(new Error("Database unavailable"));
    const res = await signOut();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: "SIGNOUT_UNAVAILABLE" }),
    );
    expect(h.clearCookie).not.toHaveBeenCalled();
  });

  it("clears the cookie only after revocation succeeds", async () => {
    h.update.mockImplementation(async () => {
      expect(h.clearCookie).not.toHaveBeenCalled();
    });
    const res = await signOut();
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.clearCookie).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it.each(["absent", "invalid", "revoked"])("safely clears an %s session", async (kind) => {
    if (kind === "absent") h.token = undefined;
    if (kind === "invalid") h.payload = null;
    if (kind === "revoked") h.select.mockResolvedValue([]);
    const res = await signOut();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.clearCookie).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
