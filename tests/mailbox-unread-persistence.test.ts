import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema";
import { persistMailboxInboxMessages } from "../src/lib/mailbox-inbox-persist";

const h = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({ drizzle: { transaction: h.transaction } }));

const owner = "00000000-0000-4000-8000-000000000001";
const mailbox = "00000000-0000-4000-8000-000000000002";
const dialect = new PgDialect();
let messages: Set<string>;
let threads: Map<string, { id: string; threadId: string; read: boolean }>;
let updates: Array<{ sql: string; params: unknown[] }>;
let accountOwned: boolean;

function message(messageId: string, threadId = "conversation") {
  return {
    accountId: mailbox,
    provider: "google",
    messageId,
    threadId,
    from: "customer@example.test",
    subject: "Appointment",
    snippet: messageId,
    receivedAt: new Date("2026-09-21T05:00:00.000Z"),
  };
}

beforeEach(() => {
  messages = new Set();
  threads = new Map();
  updates = [];
  accountOwned = true;
  h.transaction.mockImplementation(async (run) =>
    run({
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => (accountOwned ? [{ id: mailbox, provider: "google" }] : []),
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: (rows: Array<Record<string, unknown>>) => ({
          onConflictDoUpdate: () => ({
            returning: async () => {
              expect(table).toBe(schema.emailThreads);
              return rows.map((row) => {
                const external = String(row.threadId);
                if (!threads.has(external))
                  threads.set(external, {
                    id: `thread-${threads.size}`,
                    threadId: external,
                    read: false,
                  });
                return threads.get(external)!;
              });
            },
          }),
          onConflictDoNothing: () => ({
            returning: async () => {
              expect(table).toBe(schema.emailMessages);
              return rows.flatMap((row) => {
                const key = String(row.googleMessageId);
                if (messages.has(key)) return [];
                messages.add(key);
                return [{ id: messages.size, threadId: row.threadId }];
              });
            },
          }),
        }),
      }),
      update: (table: unknown) => ({
        set: (values: { read: boolean }) => ({
          where: async (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            expect(table).toBe(schema.emailThreads);
            const query = dialect.sqlToQuery(condition);
            updates.push(query);
            expect(query.sql).toContain('"wireline_email_threads"."user_id" =');
            expect(query.params).toContain(owner);
            for (const thread of threads.values())
              if (query.params.includes(thread.id)) thread.read = values.read;
          },
        }),
      }),
    }),
  );
});

describe("new inbox message unread state", () => {
  it("restores an already-read conversation when a new reply is inserted", async () => {
    await persistMailboxInboxMessages(owner, [message("first")]);
    const thread = [...threads.values()][0];
    thread.read = true;
    const result = await persistMailboxInboxMessages(owner, [message("reply")]);
    expect(result.messagesSaved).toBe(1);
    expect(thread.read).toBe(false);
  });

  it("does not mark read conversations unread again on repeated provider delivery", async () => {
    await persistMailboxInboxMessages(owner, [message("first")]);
    const thread = [...threads.values()][0];
    thread.read = true;
    updates = [];
    const result = await persistMailboxInboxMessages(owner, [message("first")]);
    expect(result.messagesSaved).toBe(0);
    expect(thread.read).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("marks only conversations with actually inserted messages in a mixed sync", async () => {
    await persistMailboxInboxMessages(owner, [message("first-a", "a"), message("first-b", "b")]);
    const [a, b] = [...threads.values()];
    a.read = b.read = true;
    updates = [];
    await persistMailboxInboxMessages(owner, [message("first-a", "a"), message("reply-b", "b")]);
    expect(a.read).toBe(true);
    expect(b.read).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0].params).not.toContain(a.id);
  });

  it("does not write unread state for a disconnected or unowned mailbox", async () => {
    accountOwned = false;
    await expect(persistMailboxInboxMessages(owner, [message("first")])).rejects.toThrow(
      "stale or unowned",
    );
    expect(threads.size).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
