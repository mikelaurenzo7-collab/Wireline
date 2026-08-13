import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * wireline_sms_threads.status is written by two independent actors: Twilio
 * delivery telemetry and the account holder's Outcome Center. The outcome
 * routes pin `escalated` to an active human-handoff task and treat
 * `booked`/`resolved` as terminal, so telemetry must never move a thread off
 * an operator-owned outcome — a late `read` receipt used to flip a resolved
 * thread back to `open` while its handoff task stayed completed, making Inbox
 * and Approvals disagree about ownership.
 */
describe("sms thread outcome ownership contract", () => {
  const webhook = read("src/routes/twilio-webhook.ts");
  const statusHandler = webhook.slice(
    webhook.indexOf('router.post("/api/twilio-webhook/message-status"'),
    webhook.indexOf("Account-level Twilio Usage Trigger"),
  );

  it("failure telemetry cannot overwrite operator-owned outcomes", () => {
    expect(statusHandler).toContain(
      'inArray(schema.smsThreads.status, ["open", "waiting", "delivery_failed"])',
    );
  });

  it("only the thread's latest outbound message may move thread status", () => {
    // Twilio callbacks arrive out of order across messages: a delayed receipt
    // for an older message must not overwrite what the newest outbound
    // already established in either direction.
    expect(statusHandler).toContain('eq(schema.smsMessages.direction, "out")');
    expect(statusHandler).toContain(
      "orderBy(desc(schema.smsMessages.createdAt), desc(schema.smsMessages.id))",
    );
    expect(statusHandler).toContain("latestOutbound?.id === message.id");
    const guard = statusHandler.indexOf("speaksForThread");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(statusHandler.indexOf('status: "delivery_failed"'));
  });

  it("delivery receipts only clear a stale failure flag, never reopen threads", () => {
    const deliveredBranch = statusHandler.slice(
      statusHandler.indexOf('["delivered", "read"].includes(status)'),
    );
    expect(deliveredBranch).toContain('eq(schema.smsThreads.status, "delivery_failed")');
    // The bare unconditional thread flip must stay gone.
    expect(statusHandler).not.toMatch(
      /set\(\{ status: "open" \}\)\s*\n?\s*\.where\(eq\(schema\.smsThreads\.id, message\.threadId\)\);/,
    );
  });

  it("operator outcomes remain the five canonical states", () => {
    // The telemetry predicate above encodes which states it may touch; if the
    // outcome vocabulary changes, both sides must be reconciled deliberately.
    const outcomes = read("src/lib/conversation-outcome.ts");
    expect(outcomes).toContain('"open",\n  "waiting",\n  "escalated",\n  "booked",\n  "resolved",');
  });
});
