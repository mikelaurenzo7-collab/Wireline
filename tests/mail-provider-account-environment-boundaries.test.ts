import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../src/lib/api-error";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  integrationConstruct: vi.fn(),
  fetchInboxMessages: vi.fn(),
  persistMailboxInboxMessages: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  verifyIcloudMailCredentials: vi.fn(),
  encryptSecret: vi.fn(),
  upsertOwnedEmailAccount: vi.fn(),
  responseJson: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => ({
  ACCOUNT_ENVIRONMENT_UNAVAILABLE: "ACCOUNT_ENVIRONMENT_UNAVAILABLE",
  assertLiveExternalActionAllowed: mocks.guard,
}));

vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    constructor(userId: string) {
      mocks.integrationConstruct(userId);
    }

    fetchInboxMessages = mocks.fetchInboxMessages;
  },
}));

vi.mock("../src/lib/mailbox-inbox-persist", () => ({
  persistMailboxInboxMessages: mocks.persistMailboxInboxMessages,
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: mocks.select,
    delete: mocks.delete,
  },
  log: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/lib/icloud-mail", () => ({
  verifyIcloudMailCredentials: mocks.verifyIcloudMailCredentials,
  icloudGrantedScopes: vi.fn(() => "imap smtp"),
}));

vi.mock("../src/lib/secret-vault", () => ({
  encryptSecret: mocks.encryptSecret,
  isVaultConfigured: vi.fn(() => true),
}));

vi.mock("../src/lib/owned-email-account", () => ({
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE: "already owned",
  upsertOwnedEmailAccount: mocks.upsertOwnedEmailAccount,
}));

vi.mock("../src/lib/nav-counts-invalidate", () => ({ touchNavCounts: vi.fn() }));
vi.mock("../src/lib/webhook-helpers", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("../src/lib/background-work", () => ({ runInBackground: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({
  createIpRateLimiter: vi.fn(() => vi.fn()),
}));

import emailSyncRouter from "../src/routes/email-sync-routes";
import icloudMailRouter from "../src/routes/icloud-mail-routes";

type RouteHandler = (request: unknown, response: unknown) => Promise<unknown>;

function routeHandler(router: unknown, path: string): RouteHandler {
  const layers = (
    router as { stack: { route?: { path: string; stack: { handle: RouteHandler }[] } }[] }
  ).stack;
  const layer = layers.find((candidate) => candidate.route?.path === path);
  expect(layer, `missing route ${path}`).toBeDefined();
  const handlers = layer!.route!.stack;
  return handlers[handlers.length - 1].handle;
}

const sync = routeHandler(emailSyncRouter, "/api/emails/sync");
const connectIcloud = routeHandler(icloudMailRouter, "/api/integrations/icloud/connect");
const disconnectIcloud = routeHandler(icloudMailRouter, "/api/integrations/icloud/disconnect");

function response() {
  return {
    json: mocks.responseJson,
    status: vi.fn(function (this: unknown) {
      return this;
    }),
  };
}

function expectNoMailboxProviderWork(): void {
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.integrationConstruct).not.toHaveBeenCalled();
  expect(mocks.fetchInboxMessages).not.toHaveBeenCalled();
  expect(mocks.persistMailboxInboxMessages).not.toHaveBeenCalled();
}

function expectNoIcloudCredentialWork(): void {
  expect(mocks.verifyIcloudMailCredentials).not.toHaveBeenCalled();
  expect(mocks.encryptSecret).not.toHaveBeenCalled();
  expect(mocks.upsertOwnedEmailAccount).not.toHaveBeenCalled();
}

describe("mail-provider account-environment boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["demo", 403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED"],
    ["test", 403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED"],
    ["missing", 503, "ACCOUNT_ENVIRONMENT_UNAVAILABLE"],
  ] as const)(
    "blocks %s inbox sync before connection lookup, provider fetch, or ingestion",
    async (environment, status, code) => {
      mocks.guard.mockRejectedValueOnce(new AppError(status, code, `${environment} blocked`));

      await expect(
        sync({ user: { id: `${environment}-user` }, body: {} }, response()),
      ).rejects.toMatchObject({ status, code });

      expect(mocks.guard).toHaveBeenCalledWith(`${environment}-user`, "mailbox_inbox_sync");
      expectNoMailboxProviderWork();
    },
  );

  it("turns an inbox-sync environment lookup failure into the same stable unavailable response", async () => {
    mocks.guard.mockRejectedValueOnce(new Error("database offline"));

    await expect(
      sync({ user: { id: "unknown-user" }, body: {} }, response()),
    ).rejects.toMatchObject({
      status: 503,
      code: "ACCOUNT_ENVIRONMENT_UNAVAILABLE",
      message: "Inbox refresh is temporarily unavailable until this workspace can be verified.",
    });

    expectNoMailboxProviderWork();
  });

  it.each([
    ["demo", new AppError(403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED", "demo blocked")],
    ["test", new AppError(403, "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED", "test blocked")],
    ["missing", new AppError(503, "ACCOUNT_ENVIRONMENT_UNAVAILABLE", "missing blocked")],
    ["lookup failure", new Error("database offline")],
  ] as const)("blocks iCloud connect for %s before IMAP or credential writes", async (_, error) => {
    mocks.guard.mockRejectedValueOnce(error);

    await expect(
      connectIcloud(
        {
          user: { id: "blocked-user" },
          body: { email_address: "owner@icloud.com", app_password: "abcd-efgh-ijkl-mnop" },
        },
        response(),
      ),
    ).rejects.toBe(error);

    expect(mocks.guard).toHaveBeenCalledWith("blocked-user", "icloud_mail_connect");
    expectNoIcloudCredentialWork();
  });

  it("keeps iCloud disconnect available without provider authorization", async () => {
    mocks.guard.mockRejectedValue(new Error("connect should not be checked"));
    mocks.deleteWhere.mockResolvedValueOnce(undefined);
    mocks.delete.mockReturnValueOnce({ where: mocks.deleteWhere });

    await expect(
      disconnectIcloud({ user: { id: "demo-user" }, body: {} }, response()),
    ).resolves.toBeUndefined();

    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.responseJson).toHaveBeenCalledWith({ ok: true });
    expectNoIcloudCredentialWork();
  });
});
