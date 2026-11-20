import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  exchange: vi.fn(),
  disconnect: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { error: vi.fn() },
  IS_PROD: false,
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: h.guard,
}));
vi.mock("../src/lib/google-apis", () => ({ googleApis: vi.fn() }));
vi.mock("../src/lib/secret-vault", () => ({ encryptSecret: vi.fn() }));
vi.mock("../src/middleware/rate-limit-middleware", () => ({ oauthRateLimiter: vi.fn() }));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/lib/csp", () => ({ buildCSP: vi.fn(), generateCspNonce: vi.fn() }));
vi.mock("../src/lib/oauth-helpers", () => ({
  getGoogleOAuthClient: vi.fn(),
  generateOAuthState: vi.fn(),
  verifyAndClaimOAuthState: async () => ({ ok: true, userId: "owner" }),
  resolveLinkedOAuthUserId: async () => "owner",
}));
vi.mock("../src/lib/google-sheets-service", () => ({
  googleSheetsConfigured: () => true,
  getGoogleSheetsAuthUrl: h.authorize,
  exchangeGoogleSheetsCode: h.exchange,
  disconnectGoogleSheets: h.disconnect,
}));

import router from "../src/routes/oauth/google-sheets";

function handler(path: string) {
  const layer = router.stack.find(
    (entry) =>
      entry.route &&
      (Array.isArray(entry.route.path)
        ? entry.route.path.includes(path)
        : entry.route.path === path),
  );
  return layer!.route.stack.at(-1).handle as (req: Request, res: Response) => Promise<void>;
}

describe("retired connector OAuth routes", () => {
  it("blocks a new start and an already-started callback before provider work", async () => {
    h.authorize.mockReset();
    h.exchange.mockReset();
    h.guard.mockReset();
    const req = {
      user: { id: "owner" },
      query: { code: "code", state: "state" },
    } as unknown as Request;
    const res = { json: vi.fn() } as unknown as Response;
    await expect(handler("/api/oauth/google_sheets/url")(req, res)).rejects.toMatchObject({
      status: 410,
      code: "CONNECTION_RETIRED",
    });
    await expect(handler("/api/oauth/google_sheets/callback")(req, res)).rejects.toMatchObject({
      status: 410,
      code: "CONNECTION_RETIRED",
    });
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.exchange).not.toHaveBeenCalled();
    expect(h.guard).not.toHaveBeenCalled();
  });

  it("preserves the existing disconnect route", async () => {
    h.disconnect.mockReset().mockResolvedValue(undefined);
    const json = vi.fn();
    await handler("/api/oauth/google_sheets/disconnect")(
      { user: { id: "owner" } } as Request,
      { json } as unknown as Response,
    );
    expect(h.disconnect).toHaveBeenCalledWith("owner");
    expect(json).toHaveBeenCalledWith({ ok: true });
  });
});
