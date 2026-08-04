import { describe, expect, it, vi, beforeEach } from "vitest";

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

import {
  verifyIcloudMailCredentials,
  fetchIcloudInbox,
  sendIcloudMail,
  ICLOUD_IMAP_HOST,
} from "./icloud-mail";

describe("icloud-mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([101, 102]);
    mockFetch.mockImplementation(async function* () {
      yield {
        uid: 102,
        envelope: {
          messageId: "<test@icloud.com>",
          from: [{ name: "Sender", address: "sender@example.com" }],
          subject: "Hello iCloud",
          date: new Date("2026-06-01T12:00:00Z"),
        },
      };
    });
    mockVerify.mockResolvedValue(true);
    mockSendMail.mockResolvedValue({ messageId: "sent-1" });
  });

  it("uses Apple's IMAP host", () => {
    expect(ICLOUD_IMAP_HOST).toBe("imap.mail.me.com");
  });

  it("verifies credentials via IMAP INBOX lock", async () => {
    await verifyIcloudMailCredentials("you@icloud.com", "app-pass");
    expect(mockConnect).toHaveBeenCalled();
    expect(mockGetMailboxLock).toHaveBeenCalledWith("INBOX");
    expect(mockLogout).toHaveBeenCalled();
  });

  it("maps inbox envelopes using UID search and UID fetch semantics", async () => {
    const messages = await fetchIcloudInbox("you@icloud.com", "app-pass", { limit: 5 });

    expect(mockSearch).toHaveBeenCalledWith({ all: true }, { uid: true });
    expect(mockFetch).toHaveBeenCalledWith(
      [102, 101],
      { envelope: true, source: false },
      { uid: true },
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      messageId: "<test@icloud.com>",
      subject: "Hello iCloud",
      provider: "icloud",
    });
  });

  it("sends mail over SMTP", async () => {
    const ok = await sendIcloudMail("you@icloud.com", "app-pass", {
      to: "lead@example.com",
      subject: "Follow up",
      body: "Hi there",
    });
    expect(ok).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "you@icloud.com",
        to: "lead@example.com",
        subject: "Follow up",
      }),
    );
  });
});
