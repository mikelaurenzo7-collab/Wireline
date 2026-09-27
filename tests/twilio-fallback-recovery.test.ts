import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ jobs: [] as any[] }));
vi.mock("../src/lib/server-context", () => ({
  tenantStore: { run: (_id: string, fn: () => unknown) => fn() },
  drizzle: {
    insert: () => ({
      values: (value: unknown) => {
        h.jobs.push(value);
        return { onConflictDoNothing: async () => {} };
      },
    }),
  },
}));
vi.mock("../src/lib/twilio-service", () => ({ getTwilioClient: vi.fn() }));
vi.mock("../src/lib/voice/twilio-fallback-store", () => ({ twilioFallbackStore: {} }));
vi.mock("../src/lib/voice/twilio-fallback", () => ({ settleTwilioFallbackReceipt: vi.fn() }));
import {
  expediteTwilioFallbackRecovery,
  reconcileTwilioFallbackJob,
} from "../src/lib/voice/twilio-fallback-recovery";

const parentSid = `CA${"1".repeat(32)}`;
const childSid = `CA${"2".repeat(32)}`;
const accountSid = `AC${"a".repeat(32)}`;
const receipt = {
  userId: "tenant",
  parentCallSid: parentSid,
  calledNumber: "+13125550101",
  callerNumber: "+13125550102",
  fallbackNumber: "+13125550103",
  agentId: "bot",
  maxSeconds: 2400,
  deadlineAtMs: 1,
  leaseId: "lease",
  leaseExpiresAt: new Date(2000).toISOString(),
  completion: null,
};
const job = { userId: "tenant", payload: { parentCallSid: parentSid } };
function harness() {
  const parent = {
    sid: parentSid,
    accountSid,
    from: receipt.callerNumber,
    to: receipt.calledNumber,
    direction: "inbound",
    status: "completed",
    endTime: new Date(Date.now() - 60000),
  };
  const child = {
    sid: childSid,
    parentCallSid: parentSid,
    accountSid,
    from: receipt.calledNumber,
    to: receipt.fallbackNumber,
    status: "completed",
    duration: "123",
  };
  const fetch = vi.fn().mockResolvedValue(parent);
  const update = vi.fn();
  const list = vi.fn().mockResolvedValue([child]);
  const calls = Object.assign(
    vi.fn(() => ({ fetch, update })),
    { list },
  );
  const client = vi.fn(() => ({ calls, accountSid }));
  const find = vi.fn().mockResolvedValue(receipt);
  const settle = vi.fn();
  const deps: any = { client, store: { find }, settle };
  return { parent, child, fetch, update, list, client, find, settle, deps };
}
beforeEach(() => {
  h.jobs = [];
  vi.stubEnv("OPENAI_PROJECT_ID", "proj_test_12345678");
});
afterEach(() => vi.unstubAllEnvs());

describe("durable fallback reconciliation", () => {
  it("normalizes the queue's snake-case owner while rejecting inconsistent ownership", async () => {
    const h = harness();
    await reconcileTwilioFallbackJob({ user_id: "tenant", payload: job.payload }, h.deps);
    expect(h.settle).toHaveBeenCalledOnce();
    h.settle.mockClear();
    await expect(
      reconcileTwilioFallbackJob(
        { userId: "other", user_id: "tenant", payload: job.payload },
        h.deps,
      ),
    ).rejects.toThrow("identity");
    expect(h.settle).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "recognizes a prior unanswered SIP leg with a human child=%s",
    async (withHuman) => {
      const h = harness();
      const prior = {
        ...h.child,
        sid: `CA${"3".repeat(32)}`,
        to: "sip:proj_test_12345678@sip.api.openai.com;transport=tls?X-BB-Inbound=signed",
        from: receipt.callerNumber,
        status: "failed",
        duration: "0",
      };
      h.list.mockResolvedValue(withHuman ? [prior, h.child] : [prior]);
      await reconcileTwilioFallbackJob(job, h.deps);
      expect(h.settle).toHaveBeenCalledWith(
        receipt,
        withHuman
          ? { childCallSid: childSid, status: "completed", durationSeconds: 123 }
          : { childCallSid: null, status: "canceled", durationSeconds: 0 },
      );
    },
  );
  it("settles only a verified terminal child at its exact carrier duration", async () => {
    const h = harness();
    await reconcileTwilioFallbackJob(job, h.deps);
    expect(h.list).toHaveBeenCalledWith({ parentCallSid: parentSid, limit: 3, pageSize: 3 });
    expect(h.settle).toHaveBeenCalledWith(receipt, {
      childCallSid: childSid,
      status: "completed",
      durationSeconds: 123,
    });
  });
  it("recovers a failed pre-Dial attempt only after terminal parent and no-child confirmation", async () => {
    const h = harness();
    h.list.mockResolvedValue([]);
    await reconcileTwilioFallbackJob(job, h.deps);
    expect(h.settle).toHaveBeenCalledWith(receipt, {
      childCallSid: null,
      status: "canceled",
      durationSeconds: 0,
    });
  });
  it("terminates the verified parent after its fixed deadline then confirms termination", async () => {
    const h = harness();
    h.fetch
      .mockResolvedValueOnce({ ...h.parent, status: "in-progress" })
      .mockResolvedValueOnce(h.parent);
    await reconcileTwilioFallbackJob(job, h.deps);
    expect(h.update).toHaveBeenCalledWith({ status: "completed" });
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it("does not cut off a still-admitted call or release its hold", async () => {
    const h = harness();
    h.find.mockResolvedValue({ ...receipt, deadlineAtMs: Date.now() + 60000 });
    h.fetch.mockResolvedValue({ ...h.parent, status: "in-progress" });
    await expect(reconcileTwilioFallbackJob(job, h.deps)).rejects.toMatchObject({ status: 503 });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
  });
  it.each([
    "owner",
    "parent account",
    "parent source",
    "child target",
    "child parent",
    "child account",
    "multiple children",
    "provider unknown",
    "malformed duration",
    "recent no-child",
  ])("retains the hold for %s uncertainty", async (failure) => {
    const h = harness();
    if (failure === "owner") h.find.mockResolvedValue({ ...receipt, userId: "other" });
    if (failure === "parent account")
      h.fetch.mockResolvedValue({ ...h.parent, accountSid: "other" });
    if (failure === "parent source") h.fetch.mockResolvedValue({ ...h.parent, from: "other" });
    if (failure === "child target") h.list.mockResolvedValue([{ ...h.child, to: "+13125559999" }]);
    if (failure === "child parent")
      h.list.mockResolvedValue([{ ...h.child, parentCallSid: childSid }]);
    if (failure === "child account")
      h.list.mockResolvedValue([{ ...h.child, accountSid: "other" }]);
    if (failure === "multiple children") h.list.mockResolvedValue([h.child, h.child]);
    if (failure === "provider unknown") h.fetch.mockRejectedValue(new Error("timeout"));
    if (failure === "malformed duration")
      h.list.mockResolvedValue([{ ...h.child, duration: "unknown" }]);
    if (failure === "recent no-child") {
      h.fetch.mockResolvedValue({ ...h.parent, endTime: new Date() });
      h.list.mockResolvedValue([]);
    }
    await expect(reconcileTwilioFallbackJob(job, h.deps)).rejects.toThrow();
    expect(h.settle).not.toHaveBeenCalled();
  });
  it("replays completed accounting without relying on current provider data", async () => {
    const h = harness();
    const completion = { childCallSid: childSid, status: "completed", durationSeconds: 123 };
    h.find.mockResolvedValue({ ...receipt, completion });
    await reconcileTwilioFallbackJob(job, h.deps);
    expect(h.client).not.toHaveBeenCalled();
    expect(h.settle).toHaveBeenCalledWith({ ...receipt, completion }, completion);
  });
  it("schedules one stable early-recovery identity without replacing the deadline safeguard", async () => {
    await expediteTwilioFallbackRecovery("tenant", parentSid);
    await expediteTwilioFallbackRecovery("tenant", parentSid);
    expect(h.jobs[0].id).toBe(h.jobs[1].id);
    expect(h.jobs[0]).toMatchObject({
      userId: "tenant",
      type: "twilio_fallback_reconcile",
      payload: { parentCallSid: parentSid },
    });
  });
});
