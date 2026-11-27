import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Bot that acts on its own leaves the owner little, and each thing it does
 * leave is a person waiting. Until this notice existed such an item changed a
 * badge inside the app and nothing else.
 */
const h = vi.hoisted(() => ({
  selects: [] as unknown[][],
  enqueue: vi.fn(),
  send: vi.fn(),
  owner: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => {
  const rows = async () => h.selects.shift() ?? [];
  const tail = { limit: rows, orderBy: () => ({ limit: rows }) };
  return {
    drizzle: {
      select: () => ({ from: () => ({ where: () => tail }) }),
      update: () => ({
        set: (value: unknown) => ({
          where: async () => {
            h.update(value);
          },
        }),
      }),
    },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    tenantStore: { run: (_id: string, work: () => Promise<void>) => work() },
  };
});
vi.mock("../src/lib/job-queue", () => ({ enqueue: h.enqueue }));
vi.mock("../src/lib/post-call-digest", () => ({ pickAccountHolderEmail: h.owner }));
vi.mock("../src/lib/email-service", () => ({ sendTenantEmail: h.send }));
vi.mock("../src/lib/app-url", () => ({
  resolveCanonicalAppUrl: () => ({ url: "https://botbound.app" }),
}));

import {
  buildNeedsYouEmail,
  handleNeedsYouNoticeJob,
  NEEDS_YOU_NOTICE_JOB,
  NEEDS_YOU_TASK_TYPES,
  needsYouLine,
  queueNeedsYouNotice,
} from "../src/lib/needs-you-notice";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const email = {
  id: "task-email",
  taskType: "send_email",
  description: "Email draft to dana@example.com: Your quote",
  payload: { to: "dana@example.com", subject: "Your quote", body: "Hi Dana" },
};
const heldText = {
  id: "task-text",
  taskType: "send_text_message",
  description: "SMS draft to +17735550100",
  payload: {
    to: "+17735550100",
    body: "We are at 12 Main St.",
    reasoning: "Not sent by your Bot: Outside the hours this person can be contacted.",
  },
};
const person = {
  id: "task-person",
  taskType: "human_escalation",
  description: "Human escalation requested: Caller wants the owner about a refund.",
  payload: { reason: "Caller wants the owner about a refund." },
};
const message = {
  id: "task-message",
  taskType: "follow_up",
  description: "Call Dana back: wants a quote for a water heater",
  payload: null,
};
const job = { id: "job-1", userId: "owner-1", payload: { userId: "owner-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.selects = [];
  h.enqueue.mockResolvedValue({ ok: true, jobId: "queued" });
  h.owner.mockResolvedValue("owner@example.com");
  h.send.mockResolvedValue({ ok: true });
});

describe("what the owner is told", () => {
  it("says what is waiting in the owner's words, and why when the Bot said", () => {
    expect(needsYouLine(email)).toEqual({
      what: "An email to dana@example.com is written and waiting for you to send",
      detail: "Subject: Your quote",
    });
    expect(needsYouLine(heldText)).toEqual({
      what: "A text to +1 (773) 555-0100 is written and waiting for you to send",
      detail:
        "We are at 12 Main St. Not sent by your Bot: Outside the hours this person can be contacted.",
    });
    expect(needsYouLine(person)).toEqual({
      what: "A caller asked for a person",
      detail: "Caller wants the owner about a refund.",
    });
    expect(needsYouLine(message)).toEqual({
      what: "Call Dana back: wants a quote for a water heater",
      detail: "",
    });
    expect(
      needsYouLine({ id: "x", taskType: "internal_task", description: null, payload: null }).what,
    ).toBe("Your Bot left you a follow-up");
  });

  it("names the one thing in the subject, or counts several", () => {
    const one = buildNeedsYouEmail([person]);
    expect(one.subject).toBe("Needs you: a caller asked for a person");
    expect(one.text).toContain("Your Bot handled the rest. This one needs you:");
    expect(one.text).toContain("Open Needs You: https://botbound.app/inbox?tab=approvals");

    const several = buildNeedsYouEmail([person, email, heldText]);
    expect(several.subject).toBe("3 things need you");
    expect(several.text).toContain("- A caller asked for a person. Caller wants the owner");
    expect(several.html).toContain('<a href="https://botbound.app/inbox?tab=approvals">');
    // The word the owner never asked for stays out of their inbox.
    expect(`${several.subject} ${several.text}`).not.toMatch(/approv(?!als$)/i);
  });

  it("lists a handful and counts the rest, and never trusts a caller's text as markup", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      ...message,
      id: `m-${index}`,
      description: `Call back caller ${index} <script>alert(1)</script>`,
    }));
    const built = buildNeedsYouEmail(many);
    expect(built.subject).toBe("9 things need you");
    expect(built.text).toContain("- and 3 more.");
    expect(built.html).not.toContain("<script>");
    expect(built.html).toContain("&lt;script&gt;");
  });
});

describe("asking for a notice", () => {
  it("queues one a little later, so one call's items arrive together", async () => {
    h.selects = [[]];
    const before = Date.now();
    await queueNeedsYouNotice("owner-1");
    expect(h.enqueue).toHaveBeenCalledOnce();
    const queued = h.enqueue.mock.calls[0][1];
    expect(queued).toMatchObject({
      userId: "owner-1",
      type: NEEDS_YOU_NOTICE_JOB,
      payload: { userId: "owner-1" },
    });
    expect(queued.runAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(queued.runAt.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
  });

  it("does not queue a second while one is already on its way", async () => {
    h.selects = [[{ id: "pending-notice" }]];
    await queueNeedsYouNotice("owner-1");
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("never throws into the Bot's work, and ignores a missing owner", async () => {
    await queueNeedsYouNotice(null);
    await queueNeedsYouNotice("");
    expect(h.enqueue).not.toHaveBeenCalled();
    h.selects = [[]];
    h.enqueue.mockRejectedValue(new Error("queue down"));
    await expect(queueNeedsYouNotice("owner-1")).resolves.toBeUndefined();
    h.enqueue.mockResolvedValue({ ok: false, error: "insert refused" });
    h.selects = [[]];
    await expect(queueNeedsYouNotice("owner-1")).resolves.toBeUndefined();
  });
});

describe("sending the notice", () => {
  it("emails the owner what is waiting and records which items it named", async () => {
    h.selects = [[], [person, email]];
    await handleNeedsYouNoticeJob(job);
    expect(h.send).toHaveBeenCalledOnce();
    const sent = h.send.mock.calls[0][0];
    expect(sent).toMatchObject({
      userId: "owner-1",
      action: "needs_you_owner_notification",
      to: "owner@example.com",
      subject: "2 things need you",
    });
    expect(sent.idempotencyKey).toMatch(/^needs-you\/[0-9a-f]{40}$/);
    expect(h.update).toHaveBeenCalledExactlyOnceWith({
      result: { notifiedTaskIds: ["task-email", "task-person"], delivered: true },
    });
  });

  it("leaves out what an earlier notice already named", async () => {
    h.selects = [
      [{ result: { notifiedTaskIds: ["task-person"] }, finishedAt: new Date() }],
      [person, heldText],
    ];
    await handleNeedsYouNoticeJob(job);
    expect(h.send.mock.calls[0][0].subject).toBe(
      "Needs you: a text to +1 (773) 555-0100 is written and waiting for you to send",
    );
    expect(h.update).toHaveBeenCalledExactlyOnceWith({
      result: { notifiedTaskIds: ["task-text"], delivered: true },
    });
  });

  it("sends nothing when nothing new is waiting", async () => {
    h.selects = [
      [{ result: { notifiedTaskIds: ["task-person"] }, finishedAt: new Date() }],
      [person],
    ];
    await handleNeedsYouNoticeJob(job);
    h.selects = [[], []];
    await handleNeedsYouNoticeJob(job);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("gives the same items the same key, so two notices cannot email twice", async () => {
    h.selects = [[], [person, email]];
    await handleNeedsYouNoticeJob(job);
    h.selects = [[], [email, person]];
    await handleNeedsYouNoticeJob({ ...job, id: "job-2" });
    expect(h.send.mock.calls[0][0].idempotencyKey).toBe(h.send.mock.calls[1][0].idempotencyKey);
    h.selects = [[], [email]];
    await handleNeedsYouNoticeJob({ ...job, id: "job-3" });
    expect(h.send.mock.calls[2][0].idempotencyKey).not.toBe(h.send.mock.calls[0][0].idempotencyKey);
  });

  it("holds back in a busy hour and reads the items again later", async () => {
    const recent = Array.from({ length: 6 }, (_, index) => ({
      result: { notifiedTaskIds: [`old-${index}`] },
      finishedAt: new Date(Date.now() - index * 60_000),
    }));
    h.selects = [recent, [person]];
    const before = Date.now();
    await handleNeedsYouNoticeJob(job);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.enqueue).toHaveBeenCalledOnce();
    expect(h.enqueue.mock.calls[0][1].runAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60_000);
  });

  it("retries a refused email and leaves the items for that retry", async () => {
    h.selects = [[], [person]];
    h.send.mockResolvedValue({ ok: false, disposition: "failed", error: "provider 500" });
    await expect(handleNeedsYouNoticeJob(job)).rejects.toThrow("provider 500");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("records a test workspace's suppressed notice so it is not read again each time", async () => {
    h.selects = [[], [person]];
    h.send.mockResolvedValue({ ok: false, disposition: "suppressed", error: "test workspace" });
    await handleNeedsYouNoticeJob(job);
    expect(h.update).toHaveBeenCalledExactlyOnceWith({
      result: { notifiedTaskIds: ["task-person"], delivered: false },
    });
  });

  it("refuses a job that names a different owner than the one it belongs to", async () => {
    await expect(
      handleNeedsYouNoticeJob({ id: "job-x", userId: "owner-1", payload: { userId: "owner-2" } }),
    ).rejects.toThrow("invalid payload");
    await expect(
      handleNeedsYouNoticeJob({ id: "job-y", userId: "owner-1", payload: {} }),
    ).rejects.toThrow("invalid payload");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("does nothing when the owner has no address to reach", async () => {
    h.selects = [[], [person]];
    h.owner.mockResolvedValue(null);
    await handleNeedsYouNoticeJob(job);
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("where a notice is asked for", () => {
  it("covers what the engine files and what the Bot leaves during a call", () => {
    const engine = read("src/lib/action-engine.ts");
    expect(engine).toContain(
      'if (values.status === "pending") await queueNeedsYouNotice(values.userId);',
    );
    const digest = read("src/lib/post-call-digest.ts");
    const handler = digest.slice(digest.indexOf("export async function handlePostCallDigestJob("));
    expect(handler.indexOf("await queueNeedsYouNotice(jobOwnerId(job));")).toBeGreaterThan(-1);
    expect(handler.indexOf("await queueNeedsYouNotice(jobOwnerId(job));")).toBeLessThan(
      handler.indexOf("await handleActivePostCallDigestJob(job);"),
    );
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain('if (job.type === "needs_you_notice") {');
    expect(read("src/lib/job-queue-base.ts")).toContain('| "needs_you_notice"');
  });

  it("leaves out what the owner made themselves and finished call notes", () => {
    expect(NEEDS_YOU_TASK_TYPES).not.toContain("human_handoff");
    expect(NEEDS_YOU_TASK_TYPES).not.toContain("post_call_note");
    for (const type of ["send_email", "send_text_message", "human_escalation", "follow_up"]) {
      expect(NEEDS_YOU_TASK_TYPES).toContain(type);
    }
  });
});
