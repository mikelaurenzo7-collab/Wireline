import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Router, Request, Response } from "express";

const h = vi.hoisted(() => ({
  channels: ["email"] as string[],
  ownInbox: false,
  grants: vi.fn(),
  require: vi.fn(),
  upsert: vi.fn(),
  calendar: vi.fn(),
  generateUrl: vi.fn(),
  token: vi.fn(),
  credentials: vi.fn(),
  fetch: vi.fn(),
  verifyIcloud: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { insert: () => ({ values: () => ({ onConflictDoUpdate: h.calendar }) }) },
  log: { warn: vi.fn(), error: vi.fn() },
  IS_PROD: false,
}));
vi.mock("../src/lib/channel-entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/channel-entitlements")>()),
  getTenantChannelEntitlements: h.grants,
  requireTenantChannel: h.require,
}));
vi.mock("../src/lib/oauth-connect-environment", () => ({
  assertOAuthProviderConnectAllowed: async (id: string) => id,
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/secret-vault", () => ({
  encryptSecret: (value: string) => value,
  isVaultConfigured: () => true,
}));
vi.mock("../src/lib/owned-email-account", () => ({
  upsertOwnedEmailAccount: h.upsert,
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE: "Already connected",
}));
vi.mock("../src/lib/icloud-mail", () => ({
  verifyIcloudMailCredentials: h.verifyIcloud,
  icloudGrantedScopes: () => "mail",
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/rate-limit-middleware", () => ({ oauthRateLimiter: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ createIpRateLimiter: () => vi.fn() }));
vi.mock("../src/lib/google-apis", () => ({
  googleApis: async () => ({
    oauth2: () => ({
      userinfo: { get: async () => ({ data: { email: "calendar@example.test" } }) },
    }),
  }),
}));
vi.mock("../src/lib/csp", () => ({ buildCSP: () => "csp", generateCspNonce: () => "nonce" }));
vi.mock("../src/lib/oauth-helpers", () => {
  const SCOPES = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ];
  const MS_SCOPES =
    "offline_access User.Read Mail.Send Mail.Read Calendars.ReadWrite Files.Read.All";
  return {
    SCOPES,
    MS_SCOPES,
    googleConnectScopes: (emailIncluded: boolean) =>
      emailIncluded ? [...SCOPES] : SCOPES.filter((scope) => !scope.includes("/gmail.")),
    microsoftConnectScopes: (emailIncluded: boolean) =>
      emailIncluded
        ? MS_SCOPES
        : MS_SCOPES.split(" ")
            .filter((scope) => !scope.startsWith("Mail."))
            .join(" "),
    getGoogleOAuthClient: async () => ({
      generateAuthUrl: h.generateUrl,
      getToken: h.token,
      setCredentials: h.credentials,
    }),
    getMicrosoftRedirectUri: () => "https://app.example.test/callback",
    generateOAuthState: () => "signed-state",
    verifyAndClaimOAuthState: async () => ({ ok: true, userId: "tenant-a" }),
    resolveLinkedOAuthUserId: async () => "tenant-a",
  };
});
import google from "../src/routes/oauth/google";
import microsoft from "../src/routes/oauth/microsoft";
import icloud from "../src/routes/icloud-mail-routes";

function handler(router: Router, path: string) {
  const layer = router.stack.find(
    (layer: { route?: { path: string | string[] } }) =>
      layer.route &&
      (Array.isArray(layer.route.path)
        ? layer.route.path.includes(path)
        : layer.route.path === path),
  );
  return layer.route.stack.at(-1).handle as (req: Request, res: Response) => Promise<unknown>;
}
function response() {
  const res = { json: vi.fn(), send: vi.fn(), setHeader: vi.fn(), status: vi.fn(), type: vi.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  return res as unknown as Response;
}
const request = {
  user: { id: "tenant-a" },
  query: { code: "provider-code", state: "signed-state" },
  body: { email_address: "owner@icloud.com", app_password: "test-only" },
  protocol: "https",
  get: () => "app.example.test",
} as unknown as Request;
beforeEach(() => {
  vi.clearAllMocks();
  h.channels = ["email"];
  h.ownInbox = false;
  h.grants.mockImplementation(async () => ({ channels: h.channels, ownInbox: h.ownInbox }));
  h.require.mockResolvedValue({ channels: ["email"] });
  h.upsert.mockResolvedValue(true);
  h.calendar.mockResolvedValue(undefined);
  h.generateUrl.mockReturnValue("https://provider.example.test/authorize");
  h.token.mockResolvedValue({ tokens: { access_token: "test-only", scope: "calendar gmail" } });
  h.fetch.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("/token")
            ? { access_token: "test-only", scope: "Calendars.ReadWrite Mail.Send" }
            : { mail: "calendar@example.test" },
        ),
      ),
  );
  vi.stubGlobal("fetch", h.fetch);
  for (const name of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
  ])
    vi.stubEnv(name, "test-only");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("mail connection channel boundary", () => {
  it.each([
    ["google", google],
    ["microsoft", microsoft],
  ] as const)("lets paid Personal connect its own %s inbox", async (provider, router) => {
    h.channels = ["voice"];
    h.ownInbox = true;
    await handler(router, `/api/oauth/${provider}/callback`)(request, response());
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "tenant-a", provider }),
    );
    expect(h.calendar).toHaveBeenCalledOnce();
  });

  it("keeps Google calendar and Drive authorization while omitting Gmail scopes for Calls", async () => {
    h.channels = ["voice"];
    await handler(google, "/api/oauth/google/url")(request, response());
    const scopes = h.generateUrl.mock.calls[0][0].scope as string[];
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(scopes).toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(scopes).toContain("https://www.googleapis.com/auth/drive.file");
    expect(scopes.some((scope) => scope.includes("gmail"))).toBe(false);
  });
  it("keeps Microsoft calendar and files authorization while omitting Mail scopes for Calls", async () => {
    h.channels = ["voice"];
    const res = response();
    await handler(microsoft, "/api/oauth/microsoft/url")(request, res);
    const url = new URL(vi.mocked(res.json).mock.calls[0][0].url);
    const scope = url.searchParams.get("scope")!;
    expect(scope).toContain("Calendars.ReadWrite");
    expect(scope).toContain("Files.Read.All");
    expect(scope).not.toContain("Mail.");
  });
  it.each([
    ["google", google],
    ["microsoft", microsoft],
  ] as const)(
    "rechecks %s at callback, preserving calendar without creating a mailbox",
    async (provider, router) => {
      h.channels = ["voice"];
      await handler(router, `/api/oauth/${provider}/callback`)(request, response());
      expect(h.grants).toHaveBeenCalledWith("tenant-a");
      expect(h.upsert).not.toHaveBeenCalled();
      expect(h.calendar).toHaveBeenCalledOnce();
    },
  );
  it.each([
    ["google", google],
    ["microsoft", microsoft],
  ] as const)(
    "creates the purchased %s mailbox and calendar at callback",
    async (provider, router) => {
      await handler(router, `/api/oauth/${provider}/callback`)(request, response());
      expect(h.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "tenant-a", provider }),
      );
      expect(h.calendar).toHaveBeenCalledOnce();
    },
  );
  it("stops before credential verification when iCloud Email is excluded", async () => {
    h.require.mockRejectedValueOnce(new Error("Email excluded"));
    await expect(
      handler(icloud, "/api/integrations/icloud/connect")(request, response()),
    ).rejects.toThrow("Email excluded");
    expect(h.verifyIcloud).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });
  it.each([
    ["google", google],
    ["microsoft", microsoft],
  ] as const)(
    "does not authorize %s when capability lookup is unavailable",
    async (provider, router) => {
      h.grants.mockRejectedValueOnce(new Error("Unavailable"));
      await expect(
        handler(router, `/api/oauth/${provider}/url`)(request, response()),
      ).rejects.toThrow("Unavailable");
      expect(h.generateUrl).not.toHaveBeenCalled();
      expect(h.fetch).not.toHaveBeenCalled();
    },
  );
});
