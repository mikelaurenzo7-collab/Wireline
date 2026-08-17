import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockGetMailboxLock = vi.fn().mockResolvedValue({ release: vi.fn() });
const mockSearch = vi.fn();
const mockFetch = vi.fn();

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

const mockFetchWithTimeout = vi.fn();

vi.mock("./server-context", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  AGENTMAIL_IMAP_HOST,
  AGENTMAIL_SMTP_HOST,
  AgentMailConnectError,
  agentmailLocalPart,
  createAgentMailInbox,
  ensureAgentMailWebhook,
  fetchAgentMailInbox,
  inboxMatchesAddress,
  isAgentMailManagedAddress,
  listAgentMailInboxes,
  normalizeAgentMailInbox,
  publicAgentMailWebhookUrl,
  resolveAgentMailInbox,
  sendAgentMail,
  verifyAgentMailCredentials,
} from "./agentmail-mail";

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("agentmail-mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("creates inboxes with a stable Wireline client id", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse(201, { inbox_id: "trywireline@agentmail.to" }),
    );
    await createAgentMailInbox("am_test", "trywireline", "Aisha");
    expect(JSON.parse(mockFetchWithTimeout.mock.calls[0][1].body)).toMatchObject({
      username: "trywireline",
      display_name: "Aisha",
      client_id: "wireline-mailbox",
    });
  });

  it("registers a public inbox delivery subscription from the mailbox row", async () => {
    vi.stubEnv("APP_URL", "https://trywireline.com");
    const accountId = "11111111-1111-4111-8111-111111111111";
    expect(publicAgentMailWebhookUrl(accountId)).toBe(
      `https://trywireline.com/api/webhooks/agentmail/${accountId}`,
    );
    mockFetchWithTimeout
      .mockResolvedValueOnce(jsonResponse(200, { webhooks: [] }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          webhook_id: "wh_1",
          url: `https://trywireline.com/api/webhooks/agentmail/${accountId}`,
          secret: "whsec_test",
        }),
      );
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
      client_id: "wireline-mailbox-webhook",
    });
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
