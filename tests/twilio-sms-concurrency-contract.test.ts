import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/twilio-webhook-base.ts", "utf8");

describe("Twilio inbound SMS persistence contract", () => {
  it("persists a provider message exactly once before incrementing unread state", () => {
    expect(route).toContain("await drizzle.transaction(async (tx) =>");
    // Whitespace-tolerant: the invariant is the conflict target and the
    // insert-then-count ordering, not how Prettier wraps the chain.
    const flat = route.replace(/\s+/g, " ");
    expect(flat).toContain(
      ".onConflictDoNothing({ target: [schema.smsThreads.userId, schema.smsThreads.customerNumber], })",
    );
    expect(route).toContain(".insert(schema.smsMessages)");
    expect(flat).toContain(".onConflictDoNothing() .returning({ id: schema.smsMessages.id })");
    expect(route).toContain("if (!insertedMessage) return;");
    expect(route).toContain("unreadCount: sql`coalesce(${schema.smsThreads.unreadCount}, 0) + 1`");
  });

  it("does not restore the stale read-modify-write unread counter", () => {
    expect(route).not.toContain("(existingThread.unreadCount ?? 0) + 1");
  });
});
