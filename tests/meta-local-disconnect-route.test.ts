import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const h = vi.hoisted(() => ({ local: vi.fn(), authenticate: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { error: vi.fn() },
  IS_PROD: false,
}));
vi.mock("../src/lib/meta-service", () => ({
  metaOAuthConfigured: vi.fn(),
  getMetaAuthUrl: vi.fn(),
  exchangeMetaCode: vi.fn(),
  getMetaUserInfo: vi.fn(),
  subscribePageToLeadgen: vi.fn(),
  disconnectMeta: vi.fn(),
  disconnectMetaLocally: h.local,
}));
vi.mock("../src/middleware/rate-limit-middleware", () => ({ oauthRateLimiter: vi.fn() }));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: h.authenticate }));
vi.mock("../src/lib/secret-vault", () => ({ encryptSecret: vi.fn() }));
vi.mock("../src/lib/csp", () => ({ buildCSP: vi.fn(), generateCspNonce: vi.fn() }));
vi.mock("../src/lib/oauth-helpers", () => ({
  generateOAuthState: vi.fn(),
  verifyAndClaimOAuthState: vi.fn(),
  resolveLinkedOAuthUserId: vi.fn(),
}));
import router from "../src/routes/oauth/meta";

const route = router.stack.find(
  (entry) => entry.route?.path === "/api/oauth/meta/disconnect-local",
)!;
const handler = route.route.stack.at(-1).handle as (req: Request, res: Response) => Promise<void>;

describe("Meta local-only disconnect", () => {
  it("requires an authenticated owner and explicit local-only confirmation", async () => {
    const json = vi.fn();
    h.local.mockReset().mockResolvedValue(undefined);
    expect(
      route.route.stack.some((layer: { handle: unknown }) => layer.handle === h.authenticate),
    ).toBe(true);
    await expect(
      handler(
        { body: { confirm: "remove_local_only" } } as Request,
        { json } as unknown as Response,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      handler({ user: { id: "owner-1" }, body: {} } as Request, { json } as unknown as Response),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.local).not.toHaveBeenCalled();
    await handler(
      { user: { id: "owner-1" }, body: { confirm: "remove_local_only" } } as Request,
      { json } as unknown as Response,
    );
    expect(h.local).toHaveBeenCalledWith("owner-1");
    expect(json).toHaveBeenCalledWith({ ok: true, providerAuthorization: "unconfirmed" });
  });
});
