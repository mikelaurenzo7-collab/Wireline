import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  accounts: [] as Record<string, unknown>[],
  fetch: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: () => ({ from: () => ({ where: async () => h.accounts }) }) },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  fetchWithTimeout: (...args: unknown[]) => h.fetch(...args),
}));
vi.mock("../src/lib/secret-vault", () => ({
  decryptSecret: (value: string) => value,
  encryptSecret: (value: string) => value,
}));
vi.mock("../src/lib/google-apis", () => ({ googleApis: vi.fn() }));
vi.mock("../src/lib/zoom-service", () => ({ createMeeting: vi.fn() }));
vi.mock("../src/lib/icloud-mail", () => ({ fetchIcloudInbox: vi.fn(), sendIcloudMail: vi.fn() }));
vi.mock("../src/lib/agentmail-mail", () => ({
  fetchAgentMailInbox: vi.fn(),
  sendAgentMail: vi.fn(),
}));
vi.mock("../src/lib/account-environment-policy", () => ({}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({}));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: vi.fn() }));
vi.mock("../src/lib/managed-mail-send-spend", () => ({ sendFundedManagedEmail: vi.fn() }));

import { IntegrationService } from "../src/lib/integrations";

beforeEach(() => {
  h.fetch.mockReset();
  h.accounts = [
    {
      id: "outlook-inbox",
      provider: "microsoft",
      accessToken: "test-access",
      expiresAt: Date.now() + 3_600_000,
    },
  ];
});

describe("Microsoft mailbox refresh outcomes", () => {
  it.each([401, 403, 429, 503])("reports Graph HTTP %s as a failed mailbox", async (status) => {
    h.fetch.mockResolvedValue({ ok: false, status });
    const result = await new IntegrationService("test-user").fetchInboxMessages();
    expect(result.messages).toEqual([]);
    expect(result.successfulAccounts).toBe(0);
    expect(result.failures).toEqual([{ provider: "microsoft", error: expect.any(String) }]);
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("keeps a healthy empty mailbox distinguishable from a failed refresh", async () => {
    h.fetch.mockResolvedValue({ ok: true, json: async () => ({ value: [] }) });
    await expect(new IntegrationService("test-user").fetchInboxMessages()).resolves.toEqual({
      messages: [],
      failures: [],
      successfulAccounts: 1,
    });
  });

  it("preserves messages from another mailbox while reporting the failed provider", async () => {
    h.accounts.push({ ...h.accounts[0], id: "healthy-outlook-inbox" });
    h.fetch.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            id: "message-1",
            subject: "Customer follow-up",
            receivedDateTime: "2026-09-20T10:00:00Z",
          },
        ],
      }),
    });
    const result = await new IntegrationService("test-user").fetchInboxMessages();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      accountId: "healthy-outlook-inbox",
      messageId: "message-1",
    });
    expect(result.failures).toEqual([{ provider: "microsoft", error: expect.any(String) }]);
    expect(result.successfulAccounts).toBe(1);
  });

  it("counts a successful empty mailbox even when another account fails", async () => {
    h.accounts.push({ ...h.accounts[0], id: "healthy-empty-inbox" });
    h.fetch.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: [] }),
    });
    const result = await new IntegrationService("test-user").fetchInboxMessages();
    expect(result.messages).toEqual([]);
    expect(result.successfulAccounts).toBe(1);
    expect(result.failures).toHaveLength(1);
  });

  it.each(["yahoo", "unknown"])(
    "does not count the unsupported %s provider as reached",
    async (provider) => {
      h.accounts.push({ ...h.accounts[0], id: "unsupported-inbox", provider });
      h.fetch.mockResolvedValue({ ok: false, status: 503 });
      const result = await new IntegrationService("test-user").fetchInboxMessages();
      expect(result.messages).toEqual([]);
      expect(result.successfulAccounts).toBe(0);
      expect(result.failures).toHaveLength(2);
      expect(h.fetch).toHaveBeenCalledOnce();
    },
  );

  it("reports no successful fetch when no mailbox is connected", async () => {
    h.accounts = [];
    await expect(new IntegrationService("test-user").fetchInboxMessages()).resolves.toEqual({
      messages: [],
      failures: [],
      successfulAccounts: 0,
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
