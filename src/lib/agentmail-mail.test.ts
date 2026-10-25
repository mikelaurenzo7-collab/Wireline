import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockGetMailboxLock = vi.fn().mockResolvedValue({ release: vi.fn() });
const mockSearch = vi.fn();
const mockFetch = vi.fn();
const { mockFetchWithTimeout, mockLog } = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
  mockLog: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("imapflow", () => ({
  ImapFlow: class MockImapFlow {
    connect = mockConnect;
    logout = mockLogout;
    getMailboxLock = mockGetMailboxLock;
    search = mockSearch;
    fetch = mockFetch;
  },
}));

const mockVerify = vi.fn();
const mockSendMail = vi.fn();
const mockClose = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: mockVerify,
      sendMail: mockSendMail,
      close: mockClose,
    })),
  },
}));

vi.mock("./server-context", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  log: mockLog,
}));

import {
  AGENTMAIL_IMAP_HOST,
  AGENTMAIL_SMTP_HOST,
  AGENTMAIL_WEBHOOK_EVENT_TYPES,
  AgentMailConnectError,
  agentMailManagedInboxClientId,
  agentMailWebhookClientId,
  agentmailLocalPart,
  createAgentMailInbox,
  deleteAgentMailWebhooksForAccount,
  deleteWirelineAgentMailWebhooks,
  ensureAgentMailWebhook,
  fetchAgentMailInbox,
  findAgentMailReplyThreading,
  inboxMatchesAddress,
  isAgentMailManagedAddress,
  listAgentMailInboxes,
  normalizeAgentMailInbox,
  publicAgentMailWebhookUrl,
  resolveAgentMailInbox,
  sendAgentMail,
  verifyAgentMailCredentials,
} from "./agentmail-mail";
import { mailboxScopedExternalId } from "./mailbox-identity";

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("AgentMail conversation reply lookup", () => {
  const accountId = "account-qa";
  const query = {
    from: "sender@example.com",
    subject: "Re: Founder QA: Readiness",
    accountId,
    scopedThreadId: mailboxScopedExternalId(accountId, "agentmail", "original-thread"),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithTimeout.mockReset();
  });

  it("uses the exact mailbox thread even when a newer message has the same subject", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        messages: [
          {
            from: "sender@example.com",
            thread_id: "different-thread",
            message_id: "<wrong@example.com>",
          },
          {
            from: "Sender <SENDER@example.com>",
            thread_id: "original-thread",
            message_id: "<right@example.com>",
            references: ["<root@example.com>", "bad\r\nheader"],
          },
        ],
      }),
    );
    await expect(findAgentMailReplyThreading("bot@example.com", "key", query)).resolves.toEqual({
      inReplyTo: "<right@example.com>",
      references: "<root@example.com> <right@example.com>",
    });
    expect(mockFetchWithTimeout.mock.calls[0][0]).toContain("/inboxes/bot%40example.com/messages?");
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("matches the exact message identity used by existing IMAP imports", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        messages: [
          {
            from: query.from,
            thread_id: "provider-thread",
            message_id: "<imported@example.com>",
          },
        ],
      }),
    );
    await expect(
      findAgentMailReplyThreading("bot@example.com", "key", {
        ...query,
        scopedThreadId: mailboxScopedExternalId(accountId, "agentmail", "<imported@example.com>"),
      }),
    ).resolves.toEqual({
      inReplyTo: "<imported@example.com>",
      references: "<imported@example.com>",
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("does not attach another mailbox, sender, or malformed message id", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, {
        messages: [
          {
            from: "other@example.com",
            thread_id: "original-thread",
            message_id: "<other@example.com>",
          },
          {
            from: query.from,
            thread_id: "original-thread",
            message_id: "<id>\r\nBcc: other@example.com",
          },
        ],
      }),
    );
    await expect(findAgentMailReplyThreading("bot@example.com", "key", query)).resolves.toBeNull();
    await expect(
      findAgentMailReplyThreading("bot@example.com", "key", {
        ...query,
        accountId: "other-account",
      }),
    ).resolves.toBeNull();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("follows bounded pages and stops on a repeated cursor", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      jsonResponse(200, { messages: [], next_page_token: "same" }),
    );
    await expect(findAgentMailReplyThreading("bot@example.com", "key", query)).resolves.toBeNull();
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("keeps a provider lookup failure unthreaded without guessing from a subject", async () => {
    mockFetchWithTimeout.mockResolvedValue(jsonResponse(403, {}));
    await expect(findAgentMailReplyThreading("bot@example.com", "key", query)).resolves.toBeNull();
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe("agentmail-mail", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithTimeout.mockReset();
    mockConnect.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([101, 102]);
    mockFetch.mockImplementation(async function* () {
      yield {
        uid: 102,
        envelope: {
          messageId: "<test@agentmail.to>",
          from: [{ name: "Sender", address: "sender@example.com" }],
          subject: "Hello AgentMail",
          date: new Date("2026-06-01T12:00:00Z"),
        },
      };
    });
    mockVerify.mockResolvedValue(true);
    mockSendMail.mockResolvedValue({ messageId: "sent-1" });
  });

  it("uses AgentMail IMAP and SMTP hosts", () => {
    expect(AGENTMAIL_IMAP_HOST).toBe("imap.agentmail.to");
    expect(AGENTMAIL_SMTP_HOST).toBe("smtp.agentmail.to");
  });

  it("normalizes snake_case and camelCase inbox payloads", () => {
    expect(normalizeAgentMailInbox({ inbox_id: "sales@agentmail.to" })).toEqual({
      inboxId: "sales@agentmail.to",
      email: "sales@agentmail.to",
    });
    expect(normalizeAgentMailInbox({ inboxId: "inb_1", email: "sales@trywireline.com" })).toEqual({
      inboxId: "inb_1",
      email: "sales@trywireline.com",
    });
  });

  it("matches inbox id or email against the requested address", () => {
    expect(
      inboxMatchesAddress({ inboxId: "inb_1", email: "sales@agentmail.to" }, "sales@agentmail.to"),
    ).toBe(true);
    expect(agentmailLocalPart("sales@agentmail.to")).toBe("sales");
    expect(isAgentMailManagedAddress("sales@trywireline.com")).toBe(false);
  });

  it("lists inboxes with a bearer API key and rejects unauthorized keys", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(200, { inboxes: [{ inbox_id: "sales@agentmail.to" }] }),
    );
    await expect(listAgentMailInboxes("am_test")).resolves.toEqual([
      { inboxId: "sales@agentmail.to", email: "sales@agentmail.to" },
    ]);
    expect(mockFetchWithTimeout.mock.calls[0][0]).toContain("/inboxes?");
    expect(mockFetchWithTimeout.mock.calls[0][1].headers.Authorization).toBe("Bearer am_test");

    mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse(401, { error: "unauthorized" }));
    await expect(listAgentMailInboxes("bad")).rejects.toBeInstanceOf(AgentMailConnectError);
  });

  it("reuses an existing inbox and creates a free-tier @agentmail.to inbox when missing", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(200, {
        inboxes: [{ email: "other@agentmail.to", inbox_id: "other@agentmail.to" }],
      }),
    );
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(201, { inbox_id: "sales@agentmail.to", email: "sales@agentmail.to" }),
    );
    await expect(resolveAgentMailInbox("am_test", "sales@agentmail.to")).resolves.toEqual({
      inboxId: "sales@agentmail.to",
      email: "sales@agentmail.to",
    });
    const createCall = mockFetchWithTimeout.mock.calls[1];
    expect(createCall[0]).toBe("https://api.agentmail.to/v0/inboxes");
    expect(JSON.parse(createCall[1].body)).toMatchObject({ username: "sales" });
  });

  it("does not invent a custom-domain inbox on the free AgentMail domain", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse(200, { inboxes: [] }));
    await expect(resolveAgentMailInbox("am_test", "sales@trywireline.com")).rejects.toThrow(
      /Custom domains/,
    );
  });

  it("creates inboxes with provider-valid stable IDs without collapsing Bot or domain identity", async () => {
    const created = new Map<string, string>();
    mockFetchWithTimeout.mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (!/^[A-Za-z0-9._~-]+$/.test(body.client_id)) {
        return jsonResponse(400, { message: "client_id invalid_format" });
      }
      const address = `${body.username}@${body.domain || "agentmail.to"}`;
      if (!created.has(body.client_id)) created.set(body.client_id, address);
      return jsonResponse(201, { inbox_id: created.get(body.client_id) });
    });
    await createAgentMailInbox("am_test", "trywireline", "Aisha");
    expect(JSON.parse(mockFetchWithTimeout.mock.calls[0][1].body)).toMatchObject({
      username: "trywireline",
      display_name: "Aisha",
      client_id: "wireline-mailbox",
    });
    for (const [agentId, domain, username] of [
      ["agent:one", "bots.botbound.app", "one"],
      ["agent-one", "bots.botbound.app", "two"],
      ["agent:one", "other.botbound.app", "three"],
    ]) {
      const clientId = agentMailManagedInboxClientId(agentId, domain);
      await expect(
        createAgentMailInbox("am_test", username, "Front Desk", { domain, clientId }),
      ).resolves.toMatchObject({ email: `${username}@${domain}` });
      await expect(
        createAgentMailInbox("am_test", username, "Renamed Bot", {
          domain,
          clientId: agentMailManagedInboxClientId(agentId, ` ${domain.toUpperCase()} `),
        }),
      ).resolves.toMatchObject({ email: `${username}@${domain}` });
    }
    expect(created.size).toBe(4);
  });

  it("registers a public inbox delivery subscription from the mailbox row", async () => {
    vi.stubEnv("APP_URL", "https://trywireline.com");
    const accountId = "11111111-1111-4111-8111-111111111111";
    expect(publicAgentMailWebhookUrl(accountId)).toBe(
      `https://trywireline.com/api/webhooks/agentmail/${accountId}`,
    );
    mockFetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(200, { webhooks: [] }))
      .mockImplementationOnce(async (_url: string, options: RequestInit) => {
        const body = JSON.parse(String(options.body));
        if (!/^[A-Za-z0-9._~-]+$/.test(body.client_id)) {
          return jsonResponse(400, { message: "client_id invalid_format" });
        }
        return jsonResponse(201, {
          webhook_id: "wh_1",
          url: `https://trywireline.com/api/webhooks/agentmail/${accountId}`,
          secret: "whsec_test",
        });
      });
    await expect(
      ensureAgentMailWebhook({
        apiKey: "am_test",
        inboxId: "trywireline@agentmail.to",
        accountId,
        hasStoredSecret: false,
      }),
    ).resolves.toEqual({ webhookId: "wh_1", secret: "whsec_test" });
    expect(JSON.parse(mockFetchWithTimeout.mock.calls[1][1].body)).toMatchObject({
      inbox_ids: ["trywireline@agentmail.to"],
      client_id: agentMailWebhookClientId(
        accountId,
        `https://trywireline.com/api/webhooks/agentmail/${accountId}`,
      ),
    });
    vi.unstubAllEnvs();
  });

  it("adopts an existing account webhook and GETs the signing secret without deleting it", async () => {
    vi.stubEnv("APP_URL", "https://botbound.app");
    const accountId = "42a8c934-7b02-4d8d-95c4-3573d7aab937";
    const url = `https://botbound.app/api/webhooks/agentmail/${accountId}`;
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        jsonResponse(200, {
          webhooks: [
            {
              webhook_id: "wh_console",
              url: `${url}/`,
              event_types: [...AGENTMAIL_WEBHOOK_EVENT_TYPES],
            },
            {
              webhook_id: "wh_legacy",
              client_id: "wireline-mailbox-webhook",
              url: `https://botbound.me/api/webhooks/agentmail/${accountId}`,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          webhook_id: "wh_console",
          url,
          secret: "whsec_adopted",
        }),
      );
    await expect(
      ensureAgentMailWebhook({
        apiKey: "am_test",
        inboxId: "michael@botbound.app",
        accountId,
        hasStoredSecret: false,
      }),
    ).resolves.toEqual({ webhookId: "wh_console", secret: "whsec_adopted" });
    expect(mockFetchWithTimeout.mock.calls).toHaveLength(2);
    expect(mockFetchWithTimeout.mock.calls[1][0]).toContain("/webhooks/wh_console");
    expect(mockFetchWithTimeout.mock.calls[1][1]?.method).not.toBe("DELETE");
    expect(
      mockFetchWithTimeout.mock.calls.some(
        (call) => call[1]?.method === "DELETE" && String(call[0]).includes("/webhooks/wh_console"),
      ),
    ).toBe(false);
    vi.unstubAllEnvs();
  });

  it("logs AgentMail HTTP status and a redacted body when webhook create fails", async () => {
    vi.stubEnv("APP_URL", "https://botbound.app");
    const accountId = "11111111-1111-4111-8111-111111111111";
    mockFetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(200, { webhooks: [] }))
      .mockResolvedValueOnce(
        jsonResponse(400, {
          name: "ValidationError",
          code: "invalid_event_types",
          message: "event_types contains an unknown value",
          secret: "whsec_must_not_leak",
          errors: [{ path: "event_types", message: "unknown value" }],
        }),
      );
    await expect(
      ensureAgentMailWebhook({
        apiKey: "am_test",
        inboxId: "michael@botbound.app",
        accountId,
        hasStoredSecret: false,
      }),
    ).rejects.toThrow("Could not register the AgentMail inbound webhook for this inbox.");
    expect(mockLog.warn).toHaveBeenCalledWith(
      "AgentMail webhook request failed",
      expect.objectContaining({
        operation: "webhooks.create",
        status: 400,
        body: expect.objectContaining({
          code: "invalid_event_types",
          message: "event_types contains an unknown value",
          secret: "[REDACTED]",
        }),
      }),
    );
    vi.unstubAllEnvs();
  });

  it("logs AgentMail HTTP status and body when webhook list fails", async () => {
    vi.stubEnv("APP_URL", "https://botbound.app");
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(403, { code: "missing_permission", message: "webhook_read is required" }),
    );
    await expect(
      ensureAgentMailWebhook({
        apiKey: "am_test",
        inboxId: "michael@botbound.app",
        accountId: "11111111-1111-4111-8111-111111111111",
        hasStoredSecret: false,
      }),
    ).rejects.toThrow("That AgentMail API key was rejected.");
    expect(mockLog.warn).toHaveBeenCalledWith(
      "AgentMail webhook request failed",
      expect.objectContaining({
        operation: "webhooks.list",
        status: 403,
        body: expect.objectContaining({ code: "missing_permission" }),
      }),
    );
    vi.unstubAllEnvs();
  });

  it("GETs the signing secret when create omits it from the response", async () => {
    vi.stubEnv("APP_URL", "https://botbound.app");
    const accountId = "11111111-1111-4111-8111-111111111111";
    const url = `https://botbound.app/api/webhooks/agentmail/${accountId}`;
    mockFetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(200, { webhooks: [] }))
      .mockResolvedValueOnce(jsonResponse(201, { webhook_id: "wh_created", url }))
      .mockResolvedValueOnce(
        jsonResponse(200, { webhook_id: "wh_created", url, secret: "whsec_from_get" }),
      );
    await expect(
      ensureAgentMailWebhook({
        apiKey: "am_test",
        inboxId: "michael@botbound.app",
        accountId,
        hasStoredSecret: false,
      }),
    ).resolves.toEqual({ webhookId: "wh_created", secret: "whsec_from_get" });
    expect(mockFetchWithTimeout.mock.calls[2][0]).toContain("/webhooks/wh_created");
    vi.unstubAllEnvs();
  });

  it("does not steal another mailbox's delivery subscription when connecting a second inbox", async () => {
    vi.stubEnv("APP_URL", "https://trywireline.com");
    const firstAccountId = "11111111-1111-4111-8111-111111111111";
    const secondAccountId = "22222222-2222-4222-8222-222222222222";
    const firstUrl = `https://trywireline.com/api/webhooks/agentmail/${firstAccountId}`;
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        jsonResponse(200, {
          webhooks: [
            {
              webhook_id: "wh_first",
              url: firstUrl,
              client_id: agentMailWebhookClientId(firstAccountId),
              inbox_ids: ["sales@agentmail.to"],
              event_types: [
                "message.received",
                "message.sent",
                "message.delivered",
                "message.bounced",
                "message.complained",
                "message.rejected",
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          webhook_id: "wh_second",
          url: `https://trywireline.com/api/webhooks/agentmail/${secondAccountId}`,
          secret: "whsec_second",
        }),
      );
    await expect(
      ensureAgentMailWebhook({
        apiKey: "am_test",
        inboxId: "support@agentmail.to",
        accountId: secondAccountId,
        hasStoredSecret: false,
      }),
    ).resolves.toEqual({ webhookId: "wh_second", secret: "whsec_second" });
    const methods = mockFetchWithTimeout.mock.calls.map((call) => call[1]?.method);
    expect(methods).not.toContain("DELETE");
    expect(JSON.parse(mockFetchWithTimeout.mock.calls[1][1].body)).toMatchObject({
      inbox_ids: ["support@agentmail.to"],
      client_id: agentMailWebhookClientId(
        secondAccountId,
        `https://trywireline.com/api/webhooks/agentmail/${secondAccountId}`,
      ),
    });
    vi.unstubAllEnvs();
  });

  it("removes only this mailbox's delivery subscription on disconnect", async () => {
    vi.stubEnv("APP_URL", "https://trywireline.com");
    const keepAccountId = "11111111-1111-4111-8111-111111111111";
    const dropAccountId = "22222222-2222-4222-8222-222222222222";
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        jsonResponse(200, {
          webhooks: [
            {
              webhook_id: "wh_keep",
              url: `https://trywireline.com/api/webhooks/agentmail/${keepAccountId}`,
              client_id: agentMailWebhookClientId(keepAccountId),
            },
            {
              webhook_id: "wh_drop",
              url: `https://trywireline.com/api/webhooks/agentmail/${dropAccountId}`,
              client_id: agentMailWebhookClientId(dropAccountId),
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(204, {}));
    await deleteAgentMailWebhooksForAccount({ apiKey: "am_test", accountId: dropAccountId });
    expect(mockFetchWithTimeout.mock.calls[1][0]).toContain("/webhooks/wh_drop");
    expect(mockFetchWithTimeout.mock.calls[1][1].method).toBe("DELETE");
    expect(mockFetchWithTimeout.mock.calls).toHaveLength(2);
    vi.unstubAllEnvs();
  });

  it("drops legacy org-wide Wireline webhooks during full API-key cleanup", async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        jsonResponse(200, {
          webhooks: [
            {
              webhook_id: "wh_legacy",
              url: "https://trywireline.com/api/webhooks/agentmail/11111111-1111-4111-8111-111111111111",
              client_id: "wireline-mailbox-webhook",
            },
            {
              webhook_id: "wh_other",
              url: "https://example.com/hooks",
              client_id: "other-app",
            },
            {
              webhook_id: "wh_lookalike",
              url: "https://example.com/other",
              client_id: "wireline-mailbox-webhook-other-app",
            },
            {
              webhook_id: "wh_current_key",
              url: "https://old.example/hooks",
              client_id: agentMailWebhookClientId("mailbox", "https://old.example/hooks"),
            },
          ],
        }),
      )
      .mockResolvedValue(jsonResponse(204, {}));
    await deleteWirelineAgentMailWebhooks("am_test");
    expect(mockFetchWithTimeout.mock.calls[1][0]).toContain("/webhooks/wh_legacy");
    expect(mockFetchWithTimeout.mock.calls[2][0]).toContain("/webhooks/wh_current_key");
    expect(mockFetchWithTimeout.mock.calls).toHaveLength(3);
  });

  it("preserves old hooks until the caller can durably store the current signing secret", async () => {
    vi.stubEnv("APP_URL", "https://botbound.app");
    const accountId = "11111111-1111-4111-8111-111111111111";
    const path = `/api/webhooks/agentmail/${accountId}`;
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(200, {
        webhooks: [
          {
            webhook_id: "old",
            client_id: "wireline-mailbox-webhook",
            url: `https://botbound.me${path}`,
          },
          {
            webhook_id: "new",
            secret: "whsec_current",
            client_id: agentMailWebhookClientId(accountId),
            url: `https://botbound.app${path}`,
            inbox_ids: ["bot@botbound.app"],
            event_types: [...AGENTMAIL_WEBHOOK_EVENT_TYPES],
          },
          {
            webhook_id: "other-account",
            client_id: "wireline-mailbox-webhook",
            url: "https://botbound.me/api/webhooks/agentmail/another-account",
          },
          {
            webhook_id: "lookalike",
            client_id: "wireline-mailbox-webhook",
            url: `https://botbound.me.attacker.example${path}`,
          },
        ],
      }),
    );
    await expect(
      ensureAgentMailWebhook({
        apiKey: "am_test",
        inboxId: "bot@botbound.app",
        accountId,
        hasStoredSecret: true,
      }),
    ).resolves.toEqual({ webhookId: "new", secret: "whsec_current" });
    expect(mockFetchWithTimeout.mock.calls).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it("disconnects an exact legacy generic hook without touching another account or host", async () => {
    vi.stubEnv("APP_URL", "https://botbound.app");
    const accountId = "11111111-1111-4111-8111-111111111111";
    const path = `/api/webhooks/agentmail/${accountId}`;
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        jsonResponse(200, {
          webhooks: [
            {
              webhook_id: "legacy",
              client_id: "wireline-mailbox-webhook",
              url: `https://trywireline.com${path}`,
            },
            {
              webhook_id: "wrong-path",
              client_id: "wireline-mailbox-webhook",
              url: `https://botbound.me${path}/extra`,
            },
            {
              webhook_id: "insecure",
              client_id: "wireline-mailbox-webhook",
              url: `http://botbound.me${path}`,
            },
            {
              webhook_id: "foreign",
              client_id: "wireline-mailbox-webhook",
              url: `https://foreign.example${path}`,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(204, {}));
    await deleteAgentMailWebhooksForAccount({ apiKey: "am_test", accountId });
    expect(mockFetchWithTimeout.mock.calls).toHaveLength(2);
    expect(mockFetchWithTimeout.mock.calls[1][0]).toContain("/webhooks/legacy");
    vi.unstubAllEnvs();
  });

  it("verifies credentials via IMAP INBOX lock", async () => {
    await verifyAgentMailCredentials("sales@agentmail.to", "am_test");
    expect(mockConnect).toHaveBeenCalled();
    expect(mockGetMailboxLock).toHaveBeenCalledWith("INBOX");
    expect(mockLogout).toHaveBeenCalled();
  });

  it("maps inbox envelopes using UID search and UID fetch semantics", async () => {
    const messages = await fetchAgentMailInbox("sales@agentmail.to", "am_test", { limit: 5 });
    expect(mockSearch).toHaveBeenCalledWith({ all: true }, { uid: true });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      messageId: "<test@agentmail.to>",
      subject: "Hello AgentMail",
      provider: "agentmail",
    });
  });

  it("sends mail over SMTPS and preserves unsubscribe headers", async () => {
    const unsubscribeHeaders = {
      "List-Unsubscribe": "<https://trywireline.com/api/email/unsubscribe?token=test>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    const ok = await sendAgentMail("sales@agentmail.to", "am_test", {
      to: "lead@example.com",
      subject: "Offer",
      body: "Raw body",
      textBody: "Offer\n\nUnsubscribe",
      htmlBody: "<p>Offer</p>",
      unsubscribeHeaders,
    });
    expect(ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "sales@agentmail.to",
        text: "Offer\n\nUnsubscribe",
        html: "<p>Offer</p>",
        headers: unsubscribeHeaders,
      }),
    );
  });
});
