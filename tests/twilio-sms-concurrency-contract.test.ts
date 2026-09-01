import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/twilio-webhook-base.ts", "utf8");

describe("Twilio inbound SMS persistence contract", () => {
  it("persists a provider message exactly once before incrementing unread state", () => {
    expect(route).toContain("await drizzle.transaction(async (tx) =>");
    const persistence = route.slice(
      route.indexOf("export async function persistInboundSmsEvidence"),
      route.indexOf('router.post("/api/twilio-webhook/voice-fallback"'),
    );
    const flat = persistence.replace(/\s+/g, " ");
    expect(flat).toContain(".insert(schema.smsThreads) .values({");
    expect(flat).toContain("destinationNumber: input.destinationNumber");
    expect(flat).toContain(".onConflictDoNothing() .returning({ id: schema.smsThreads.id");
    expect(flat).toContain("eq(schema.smsThreads.userId, input.userId)");
    expect(flat).toContain("eq(schema.smsThreads.destinationNumber, input.destinationNumber)");
    expect(flat).toContain("eq(schema.smsThreads.customerNumber, input.customerNumber)");
    expect(persistence).toContain(".insert(schema.smsMessages)");
    expect(flat).toContain(".onConflictDoNothing() .returning({ id: schema.smsMessages.id })");
    const inserted = persistence.indexOf(".insert(schema.smsMessages)");
    const duplicateReturn = persistence.indexOf("if (!insertedMessage) return;", inserted);
    const unreadIncrement = persistence.indexOf(
      "unreadCount: sql`coalesce(${schema.smsThreads.unreadCount}, 0) + 1`",
      duplicateReturn,
    );
    expect(duplicateReturn).toBeGreaterThan(inserted);
    expect(unreadIncrement).toBeGreaterThan(duplicateReturn);
  });

  it("does not restore the stale read-modify-write unread counter", () => {
    expect(route).not.toContain("(existingThread.unreadCount ?? 0) + 1");
  });
});
