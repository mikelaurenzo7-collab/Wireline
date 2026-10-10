import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  fetch: vi.fn(),
  gmailList: vi.fn(),
  gmailGet: vi.fn(),
  gmailSend: vi.fn(),
  agentMailFind: vi.fn(),
  agentMailSend: vi.fn(),
  funded: vi.fn(),
}));

vi.mock("../src/lib/server-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/server-context")>();
  return {
    ...actual,
    fetchWithTimeout: h.fetch,
    drizzle: {
      select: () => ({ from: () => ({ where: async () => h.accounts }) }),
    },
  };
});
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async (input: { perform: () => Promise<unknown> }) => ({
    performed: true,
    result: await input.perform(),
  }),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
  assertExternalEntityActionAllowed: async () => undefined,
}));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: async () => undefined }));
vi.mock("../src/lib/secret-vault", () => ({
  decryptSecret: (value: string) => `plain:${value}`,
  encryptSecret: (value: string) => value,
}));
vi.mock("../src/lib/managed-mail-send-spend", () => ({
  sendFundedManagedEmail: async (input: { perform: () => Promise<boolean> }) => {
    h.funded(input);
    return input.perform();
  },
}));
vi.mock("../src/lib/agentmail-mail", () => ({
  fetchAgentMailInbox: vi.fn(),
  findAgentMailReplyThreading: h.agentMailFind,
  sendAgentMail: h.agentMailSend,
}));
vi.mock("../src/lib/google-apis", () => ({
  googleApis: async () => ({
    auth: {
      OAuth2: class {
        credentials = {};
        setCredentials() {}
      },
    },
    gmail: () => ({
      users: { messages: { list: h.gmailList, get: h.gmailGet, send: h.gmailSend } },
    }),
  }),
}));

import {
  findImapReplyThreading,
  replyReferences,
  replySubject,
} from "../src/lib/imap-reply-target";
import { IntegrationService } from "../src/lib/integrations";

const USER = "00000000-0000-4000-8000-0000000000aa";
const reply = (accountId: string) =>
  new IntegrationService(USER).sendThreadReply({
    accountId,
    to: "dana@example.com",
    subject: "Re: Quote for the kitchen",
    body: "Tuesday at 10 works.\nSee you then.",
  });
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const future = BigInt(Date.now() + 3_600_000);

beforeEach(() => {
  h.accounts = [];
  for (const mock of [
    h.fetch,
    h.gmailList,
    h.gmailGet,
    h.gmailSend,
    h.agentMailFind,
    h.agentMailSend,
    h.funded,
  ]) {
    mock.mockReset();
  }
});

describe("reply subjects and references", () => {
  it("never stacks Re: prefixes", () => {
    expect(replySubject("Quote for the kitchen")).toBe("Re: Quote for the kitchen");
    expect(replySubject("RE: re: Fwd: Quote")).toBe("Re: Quote");
    expect(replySubject("")).toBe("Re: Your message");
  });

  it("extends the thread's reference chain with the answered message", () => {
    expect(replyReferences(["<a@x>", "<b@x>"], "<c@x>")).toBe("<a@x> <b@x> <c@x>");
    expect(replyReferences(["<a@x>", "<c@x>"], "<c@x>")).toBe("<a@x> <c@x>");
  });
});

describe("IMAP reply lookup", () => {
  function fakeClient(overrides: Record<string, unknown> = {}) {
    return {
      connect: vi.fn(async () => undefined),
      getMailboxLock: vi.fn(async () => ({ release: vi.fn() })),
      search: vi.fn(async () => [3, 9, 5]),
      fetchOne: vi.fn(async () => ({
        envelope: { messageId: "<newest@mail.example>" },
        headers: Buffer.from("References: <root@mail.example>\r\n <mid@mail.example>\r\n"),
      })),
      logout: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it("threads under the newest matching message, keeping the earlier chain", async () => {
    const client = fakeClient();
    const threading = await findImapReplyThreading(client as never, {
      from: "dana@example.com",
      subject: "Re: Quote for the kitchen",
    });
    expect(client.search).toHaveBeenCalledWith(
      { from: "dana@example.com", subject: "Quote for the kitchen" },
      { uid: true },
    );
    expect(client.fetchOne).toHaveBeenCalledWith(
      "9",
      { envelope: true, headers: ["references"] },
      { uid: true },
    );
    expect(threading).toEqual({
      inReplyTo: "<newest@mail.example>",
      references: "<root@mail.example> <mid@mail.example> <newest@mail.example>",
    });
    expect(client.logout).toHaveBeenCalled();
  });

  it("falls back to an unthreaded reply when the mailbox cannot be searched", async () => {
    const client = fakeClient({ search: vi.fn(async () => Promise.reject(new Error("timeout"))) });
    await expect(
      findImapReplyThreading(client as never, { from: "dana@example.com", subject: "Quote" }),
    ).resolves.toBeNull();
    expect(client.logout).toHaveBeenCalled();
  });
});

describe("replying through each mailbox", () => {
  it("answers in the Gmail thread with In-Reply-To and References", async () => {
    h.accounts = [
      { id: "gmail-1", provider: "google", accessToken: "tok", expiresAt: future },
      { id: "other", provider: "agentmail", accessToken: "tok", emailAddress: "bot@botbound.app" },
    ];
    h.gmailList.mockResolvedValue({ data: { messages: [{ id: "m-9", threadId: "t-4" }] } });
    h.gmailGet.mockResolvedValue({
      data: {
        payload: {
          headers: [
            { name: "Message-ID", value: "<orig@gmail.example>" },
            { name: "References", value: "<root@gmail.example>" },
          ],
        },
      },
    });
    h.gmailSend.mockResolvedValue({});

    await expect(reply("gmail-1")).resolves.toEqual({ sent: true, threaded: true });

    expect(h.gmailList).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'from:dana@example.com subject:"Quote for the kitchen"' }),
    );
    const request = h.gmailSend.mock.calls[0][0].requestBody;
    expect(request.threadId).toBe("t-4");
    const mime = Buffer.from(request.raw, "base64url").toString("utf8");
    expect(mime).toContain("In-Reply-To: <orig@gmail.example>");
    expect(mime).toContain("References: <root@gmail.example> <orig@gmail.example>");
    expect(mime).toContain("To: dana@example.com");
    expect(h.agentMailSend).not.toHaveBeenCalled();
  });

  it("uses Outlook's reply action on the matching message", async () => {
    h.accounts = [{ id: "ms-1", provider: "microsoft", accessToken: "tok", expiresAt: future }];
    h.fetch
      .mockResolvedValueOnce(
        json({
          value: [
            {
              id: "older",
              subject: "Quote for the kitchen",
              receivedDateTime: "2026-10-01T10:00:00Z",
            },
            { id: "other", subject: "Invoice", receivedDateTime: "2026-10-05T10:00:00Z" },
            {
              id: "newest",
              subject: "RE: Quote for the kitchen",
              receivedDateTime: "2026-10-03T10:00:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({}));

    await expect(reply("ms-1")).resolves.toEqual({ sent: true, threaded: true });
    const [url, init] = h.fetch.mock.calls[1];
    expect(url).toBe("https://graph.microsoft.com/v1.0/me/messages/newest/reply");
    expect(JSON.parse(init.body)).toEqual({
      message: { body: { contentType: "Text", content: "Tuesday at 10 works.\nSee you then." } },
    });
  });

  it("sends a plain Re: email from Outlook when the original is gone", async () => {
    h.accounts = [{ id: "ms-1", provider: "microsoft", accessToken: "tok", expiresAt: future }];
    h.fetch.mockResolvedValueOnce(json({ value: [] })).mockResolvedValueOnce(json({}));

    await expect(reply("ms-1")).resolves.toEqual({ sent: true, threaded: false });
    expect(h.fetch.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
  });

  it("meters the managed mailbox and carries its IMAP thread headers", async () => {
    h.accounts = [
      {
        id: "bot-box",
        provider: "agentmail",
        accessToken: "tok",
        emailAddress: "bot@botbound.app",
      },
    ];
    const threading = { inReplyTo: "<a@agentmail>", references: "<a@agentmail>" };
    h.agentMailFind.mockResolvedValue(threading);
    h.agentMailSend.mockResolvedValue(true);

    await expect(reply("bot-box")).resolves.toEqual({ sent: true, threaded: true });
    expect(h.funded).toHaveBeenCalledTimes(1);
    expect(h.agentMailSend).toHaveBeenCalledWith(
      "bot@botbound.app",
      "plain:tok",
      expect.objectContaining({ to: "dana@example.com", threading }),
    );
  });

  it("refuses to send when the conversation's mailbox is no longer connected", async () => {
    h.accounts = [
      { id: "someone-else", provider: "agentmail", accessToken: "t", emailAddress: "x@y.z" },
    ];
    await expect(reply("gone")).resolves.toEqual({ sent: false, threaded: false });
    expect(h.agentMailSend).not.toHaveBeenCalled();
  });
});
