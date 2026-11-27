import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "../src/db/schema";

/**
 * A customer's text whose answer needs the owner is handed to them in Needs
 * You, with the Bot's suggestion and the reason. Before, the suggestion was
 * thrown away and the text only showed as unread.
 */
const h = vi.hoisted(() => ({
  open: [] as Array<{ id: string; payload: unknown }>,
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
  locks: 0,
  fail: false,
  notices: [] as string[],
  touched: [] as string[],
  closable: [] as Array<{ id: string }>,
}));
const tx = {
  execute: async () => {
    h.locks += 1;
  },
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => (h.fail ? Promise.reject(new Error("db down")) : h.open),
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: async (values: Record<string, unknown>) => {
      expect(table).toBe(schema.followUpTasks);
      h.inserted.push(values);
    },
  }),
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        expect(table).toBe(schema.followUpTasks);
        h.updated.push(values);
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => h.closable,
        });
      },
    }),
  }),
};
vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  drizzle: { transaction: (work: (handle: typeof tx) => unknown) => work(tx) },
}));
vi.mock("../src/lib/needs-you-notice", async (original) => ({
  ...(await original<typeof import("../src/lib/needs-you-notice")>()),
  queueNeedsYouNotice: async (userId: string) => {
    h.notices.push(userId);
  },
}));
vi.mock("../src/lib/nav-counts-invalidate", () => ({
  touchNavCounts: (userId: string) => h.touched.push(userId),
}));
import {
  SMS_REPLY_REVIEW_KIND,
  closeSmsReplyReview,
  handSmsReplyToOwner,
} from "../src/lib/sms-reply-review";
import { NEEDS_YOU_TASK_TYPES } from "../src/lib/needs-you-notice";

const text = {
  userId: "tenant-a",
  agentId: "bot-a",
  threadId: "11111111-2222-3333-4444-555555555555",
  inboundMessageId: "41",
  customerNumber: "+17735550100",
  suggestedReply: "We can look at a refund for that visit. Can I have the date?",
  reason: "The customer asked for a refund.",
};

beforeEach(() => {
  h.open = [];
  h.inserted = [];
  h.updated = [];
  h.locks = 0;
  h.fail = false;
  h.notices = [];
  h.touched = [];
  h.closable = [];
});

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").split("\r\n").join("\n");

describe("a text reply that needs the owner", () => {
  it("is filed in Needs You with the suggestion and the reason, and the owner is told", async () => {
    await expect(handSmsReplyToOwner(text)).resolves.toBe("filed");
    expect(h.locks).toBe(1);
    expect(h.inserted).toEqual([
      {
        userId: "tenant-a",
        sourceType: "sms_thread",
        sourceId: text.threadId,
        targetChannel: "manual",
        agentId: "bot-a",
        customerInfo: { phone: "+17735550100" },
        payload: {
          kind: SMS_REPLY_REVIEW_KIND,
          thread_id: text.threadId,
          inbound_message_id: "41",
          customer_number: "+17735550100",
          suggested_reply: text.suggestedReply,
          reasoning: "The customer asked for a refund.",
        },
        taskType: "follow_up",
        description: `A text from +1 (773) 555-0100 needs your reply. Your Bot suggests: "${text.suggestedReply}"`,
        status: "pending",
        priority: "high",
      },
    ]);
    expect(h.notices).toEqual(["tenant-a"]);
    expect(h.touched).toEqual(["tenant-a"]);
  });

  it("is a kind of item the owner's notice names", () => {
    expect(NEEDS_YOU_TASK_TYPES).toContain("follow_up");
  });

  it("brings the conversation's open item up to date for a later text, and tells no one twice", async () => {
    h.open = [{ id: "task-1", payload: { kind: SMS_REPLY_REVIEW_KIND, inbound_message_id: "39" } }];
    await expect(
      handSmsReplyToOwner({ ...text, suggestedReply: "Sure, what day works?", reason: "" }),
    ).resolves.toBe("updated");
    expect(h.inserted).toEqual([]);
    expect(h.updated).toEqual([
      {
        description:
          'A text from +1 (773) 555-0100 needs your reply. Your Bot suggests: "Sure, what day works?"',
        payload: expect.objectContaining({
          inbound_message_id: "41",
          reasoning: "The reply needs your judgement before it goes out.",
        }),
        // The latest text brings the item back to the top of Needs You.
        createdAt: expect.any(Date),
      },
    ]);
    expect(h.notices).toEqual([]);
    expect(h.touched).toEqual(["tenant-a"]);
  });

  it("changes nothing when the same text's job runs again", async () => {
    h.open = [{ id: "task-1", payload: { kind: SMS_REPLY_REVIEW_KIND, inbound_message_id: "41" } }];
    await expect(handSmsReplyToOwner(text)).resolves.toBe("already_filed");
    expect(h.inserted).toEqual([]);
    expect(h.updated).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it("never throws, so the text job still ends and the text stays unread in Texts", async () => {
    h.fail = true;
    await expect(handSmsReplyToOwner(text)).resolves.toBe("failed");
    expect(h.notices).toEqual([]);
  });

  it("is filed by the automatic reply job only after it rechecks the text is still unanswered", () => {
    const job = read("src/lib/sms-auto-reply.ts");
    const recheck = job.indexOf("// Recheck after model latency");
    const superseded = job.indexOf('return "superseded";', recheck);
    const filed = job.indexOf("if (needsOwner) {");
    expect(recheck).toBeGreaterThan(-1);
    expect(superseded).toBeGreaterThan(recheck);
    // After the last recheck exit, and before anything is sent.
    expect(filed).toBeGreaterThan(superseded);
    expect(filed).toBeLessThan(job.indexOf("await sendTenantMessage("));
    const branch = job.slice(filed);
    expect(branch.slice(0, branch.indexOf('return "review_required"'))).toContain(
      "await handSmsReplyToOwner(",
    );
  });
});

describe("closing a text the owner was handed", () => {
  it("closes only that conversation's open hand-off, and says whether it did", async () => {
    h.closable = [{ id: "task-1" }];
    const db = { update: tx.update } as never;
    await expect(
      closeSmsReplyReview(db, {
        userId: "tenant-a",
        threadId: text.threadId,
        status: "completed",
        note: "Answered from Texts by the Account Holder.",
      }),
    ).resolves.toBe(true);
    expect(h.updated).toEqual([
      { status: "completed", resolutionNotes: "Answered from Texts by the Account Holder." },
    ]);
    h.closable = [];
    await expect(
      closeSmsReplyReview(db, {
        userId: "tenant-a",
        threadId: text.threadId,
        status: "cancelled",
        note: "x",
      }),
    ).resolves.toBe(false);
  });

  it("happens when the owner replies from Texts, after the carrier accepts the reply", () => {
    const routes = read("src/routes/sms-routes.ts");
    const handler = routes.slice(routes.indexOf('"/api/sms/threads/:id/reply"'));
    const accepted = handler.indexOf("if (!result.ok) {");
    const closed = handler.indexOf("await closeSmsReplyReview(drizzle, {");
    expect(closed).toBeGreaterThan(accepted);
    expect(handler.slice(closed, closed + 200)).toContain("userId: req.user.id");
    expect(handler.slice(closed, closed + 200)).toContain('status: "completed"');
  });

  it("happens when the owner gives the conversation an outcome", () => {
    const routes = read("src/routes/sms-outcome-routes.ts");
    expect(routes).toContain("const reviewClosed = await closeSmsReplyReview(tx, {");
    expect(routes).toContain("nextTaskStateChanged = reconciled.length > 0 || reviewClosed;");
  });
});
