import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  thread: null as null | {
    id: string;
    accountId: string | null;
    customerEmail: string | null;
    subject: string | null;
  },
  ledger: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  threadUpdates: 0,
  sendThreadReply: vi.fn(),
}));

vi.mock("../src/lib/server-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/server-context")>();
  const { getTableName } = await import("drizzle-orm");
  type Table = Parameters<typeof getTableName>[0];
  const rowsFor = (table: Table) => {
    const name = getTableName(table);
    if (name === "wireline_email_threads") return h.thread ? [h.thread] : [];
    if (name === "wireline_audit_log") {
      const latest = h.ledger.at(-1);
      return latest ? [{ metadata: latest.metadata }] : [];
    }
    return [];
  };
  const select = () => ({
    from: (table: Table) => ({
      where: () => {
        const rows = rowsFor(table);
        const limited = { limit: async () => rows };
        return Object.assign(Promise.resolve(rows), limited, { orderBy: () => limited });
      },
    }),
  });
  const insert = (table: Table) => ({
    values: (values: Record<string, unknown>) => {
      const name = getTableName(table);
      if (name === "wireline_audit_log") h.ledger.push(values);
      if (name === "wireline_email_messages") h.messages.push(values);
      return Object.assign(Promise.resolve(undefined), {
        onConflictDoNothing: () => ({ returning: async () => [{ id: 77n }] }),
      });
    },
  });
  const update = () => ({
    set: () => ({
      where: async () => {
        h.threadUpdates += 1;
      },
    }),
  });
  return {
    ...actual,
    drizzle: {
      select,
      insert,
      update,
      transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({ select, insert, execute: async () => undefined }),
    },
  };
});
vi.mock("../src/lib/integrations", () => ({
  IntegrationService: class {
    sendThreadReply = h.sendThreadReply;
  },
}));

import { AppError } from "../src/lib/api-error";
import { replyRecipient, sendEmailThreadReply } from "../src/lib/email-thread-reply";

const USER = "00000000-0000-4000-8000-0000000000aa";
const THREAD = "00000000-0000-4000-8000-0000000000bb";
const KEY = "11111111-1111-4111-8111-111111111111";
const send = (body = "Thanks, we can do Tuesday at 10.") =>
  sendEmailThreadReply({ userId: USER, threadId: THREAD, body, operationKey: KEY });
const statuses = () => h.ledger.map((row) => (row.metadata as { status: string }).status);

async function rejectionCode(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

beforeEach(() => {
  h.thread = {
    id: THREAD,
    accountId: "00000000-0000-4000-8000-0000000000cc",
    customerEmail: "Dana Reyes <dana@example.com>",
    subject: "Re: Quote for the kitchen",
  };
  h.ledger = [];
  h.messages = [];
  h.threadUpdates = 0;
  h.sendThreadReply.mockReset().mockResolvedValue({ sent: true, threaded: true });
});

describe("reply recipient", () => {
  it("takes the one address from a bare or named sender", () => {
    expect(replyRecipient("dana@example.com")).toBe("dana@example.com");
    expect(replyRecipient("Dana Reyes <dana@example.com>")).toBe("dana@example.com");
    expect(replyRecipient("Reyes, Dana <dana@example.com>")).toBe("dana@example.com");
  });

  it("refuses lists, names alone, and anything that could add a recipient", () => {
    expect(replyRecipient("A <a@example.com>, B <b@example.com>")).toBeNull();
    expect(replyRecipient("a@example.com, b@example.com")).toBeNull();
    expect(replyRecipient("Dana Reyes")).toBeNull();
    expect(replyRecipient("dana@example.com\r\nBcc: x@example.com")).toBeNull();
    expect(replyRecipient(null)).toBeNull();
  });
});

describe("sending an inbox reply", () => {
  it("replies once from the conversation's mailbox and adds it to the transcript", async () => {
    const result = await send();

    expect(h.sendThreadReply).toHaveBeenCalledWith({
      accountId: "00000000-0000-4000-8000-0000000000cc",
      to: "dana@example.com",
      subject: "Re: Quote for the kitchen",
      body: "Thanks, we can do Tuesday at 10.",
    });
    expect(result).toMatchObject({ status: "sent", duplicate: false, threaded: true });
    expect(result.message).toMatchObject({ id: "77", role: "owner" });
    expect(h.messages).toEqual([
      expect.objectContaining({ role: "owner", content: "Thanks, we can do Tuesday at 10." }),
    ]);
    expect(h.threadUpdates).toBe(1);
    expect(statuses()).toEqual(["processing", "sent"]);
  });

  it("returns the original result for a replayed key without sending again", async () => {
    const first = await send();
    const replay = await send();

    expect(h.sendThreadReply).toHaveBeenCalledTimes(1);
    expect(replay).toEqual({ ...first, duplicate: true });
  });

  it("never resends a key whose earlier send is unresolved", async () => {
    h.sendThreadReply.mockImplementationOnce(() => new Promise(() => undefined));
    void send();
    await vi.waitFor(() => expect(statuses()).toEqual(["processing"]));

    expect(await rejectionCode(send())).toBe("EMAIL_REPLY_UNRESOLVED");
    expect(h.sendThreadReply).toHaveBeenCalledTimes(1);
  });

  it("treats edited text under an old key as a new reply, not a replay", async () => {
    await send();
    expect(await rejectionCode(send("Actually, Wednesday works better."))).toBe(
      "EMAIL_REPLY_KEY_REUSED",
    );
    expect(h.sendThreadReply).toHaveBeenCalledTimes(1);
  });

  it("lets the owner retry a reply the mailbox definitely refused", async () => {
    h.sendThreadReply.mockResolvedValueOnce({ sent: false, threaded: false });
    expect(await rejectionCode(send())).toBe("EMAIL_REPLY_NOT_SENT");
    expect(h.messages).toHaveLength(0);

    await send();
    expect(h.sendThreadReply).toHaveBeenCalledTimes(2);
    expect(statuses()).toEqual(["processing", "failed", "processing", "sent"]);
  });

  it("passes a plan refusal through instead of claiming a send", async () => {
    h.sendThreadReply.mockRejectedValueOnce(
      new AppError(
        402,
        "CHANNEL_NOT_INCLUDED",
        "Add Email to your plan before using this channel.",
      ),
    );
    expect(await rejectionCode(send())).toBe("CHANNEL_NOT_INCLUDED");
    expect(statuses()).toEqual(["processing", "failed"]);
  });

  it("refuses conversations it cannot answer safely", async () => {
    h.thread = { ...h.thread!, accountId: null };
    expect(await rejectionCode(send())).toBe("EMAIL_REPLY_NO_MAILBOX");

    h.thread = { ...h.thread!, accountId: "00000000-0000-4000-8000-0000000000cc" };
    h.thread.customerEmail = "A <a@example.com>, B <b@example.com>";
    expect(await rejectionCode(send())).toBe("EMAIL_REPLY_NO_RECIPIENT");

    h.thread = null;
    expect(await rejectionCode(send())).toBe("NOT_FOUND");
    expect(h.sendThreadReply).not.toHaveBeenCalled();
  });
});

describe("reply plumbing contracts", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("routes replies through the governed, rate-limited, idempotent endpoint", () => {
    const routes = read("src/routes/email-routes.ts");
    expect(routes).toContain('"/api/emails/threads/:id/reply"');
    expect(routes).toContain("emailReplyRateLimiter");
    expect(routes).toContain("validateBody(emailThreadReplySchema)");
  });

  it("never falls back to another mailbox or the platform sender for a reply", () => {
    const integrations = read("src/lib/integrations.ts");
    const reply = integrations.slice(
      integrations.indexOf("async sendThreadReply("),
      integrations.indexOf("// --- Private Helpers ---"),
    );
    expect(reply).toContain("candidate.id === params.accountId");
    expect(reply).toContain('await requireTenantChannel(this.userId, "email")');
    expect(reply).toContain("sendFundedManagedEmail");
    expect(reply).not.toContain("email-service");
    expect(reply).not.toContain("mailAccounts[0]");
  });
});
