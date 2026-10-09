import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  callRow: null as null | { outcomeTag: string },
  recentMissed: 0,
  rowIsNew: true,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  sendTenantEmail: vi.fn(),
  pickAccountHolderEmail: vi.fn(async () => "owner@example.test" as string | null),
}));

vi.mock("../src/lib/server-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/server-context")>();
  const { getTableName } = await import("drizzle-orm");
  type Table = Parameters<typeof getTableName>[0];
  const select = (fields: Record<string, unknown>) => ({
    from: () => ({
      where: () => {
        const rows = "count" in fields ? [{ count: h.recentMissed }] : h.callRow ? [h.callRow] : [];
        return Object.assign(Promise.resolve(rows), { limit: async () => rows });
      },
    }),
  });
  const insert = (table: Table) => ({
    values: (values: Record<string, unknown>) => {
      h.inserts.push({ table: getTableName(table), values });
      return Object.assign(Promise.resolve(undefined), {
        onConflictDoNothing: () => ({
          returning: async () => (h.rowIsNew ? [{ id: 1n }] : []),
        }),
      });
    },
  });
  return {
    ...actual,
    drizzle: {
      select,
      insert,
      transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({ select, insert }),
    },
    tenantStore: { run: (_userId: string, operation: () => unknown) => operation() },
  };
});
vi.mock("../src/lib/post-call-digest", () => ({
  pickAccountHolderEmail: h.pickAccountHolderEmail,
}));
vi.mock("../src/lib/email-service", () => ({ sendTenantEmail: h.sendTenantEmail }));

import {
  handleMissedCallAlertJob,
  MISSED_CALL_ALERT_JOB,
  recordMissedCall,
} from "../src/lib/voice/missed-calls";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const call = {
  userId: OWNER,
  agentId: "bot-1",
  twilioCallSid: "CA123",
  callerNumber: "+1 (512) 555-0100",
  reason: "concurrency" as const,
};
const alertJob = (payload: Record<string, unknown> = {}) => ({
  userId: OWNER,
  payload: {
    userId: OWNER,
    twilioCallSid: "CA123",
    callerNumber: "+15125550100",
    reason: "concurrency",
    ...payload,
  },
});

beforeEach(() => {
  h.callRow = { outcomeTag: "missed" };
  h.recentMissed = 1;
  h.rowIsNew = true;
  h.inserts = [];
  h.sendTenantEmail.mockReset();
  h.sendTenantEmail.mockResolvedValue({ ok: true });
  h.pickAccountHolderEmail.mockClear();
});

afterEach(() => {
  delete process.env.WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED;
  vi.useRealTimers();
});

describe("recording a missed call", () => {
  it("queues the owner alert with the History row", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-09T15:00:00Z") });
    await recordMissedCall(call);
    expect(h.inserts.map((insert) => insert.table)).toEqual([
      "wireline_call_logs",
      "wireline_jobs",
    ]);
    expect(h.inserts[1].values).toMatchObject({
      userId: OWNER,
      type: MISSED_CALL_ALERT_JOB,
      status: "pending",
      payload: {
        userId: OWNER,
        twilioCallSid: "CA123",
        callerNumber: "+15125550100",
        reason: "concurrency",
      },
      runAt: new Date("2026-10-09T15:00:00Z"),
    });
    // Nothing is sent inline; the queue owns delivery and its retries.
    expect(h.sendTenantEmail).not.toHaveBeenCalled();
  });

  it("waits out the voicemail window before alerting", async () => {
    process.env.WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED = "true";
    vi.useFakeTimers({ now: new Date("2026-10-09T15:00:00Z") });
    await recordMissedCall(call);
    expect(h.inserts[1].values.runAt).toEqual(new Date("2026-10-09T15:04:00Z"));
  });

  it("queues nothing more for a call already in History", async () => {
    h.rowIsNew = false;
    await recordMissedCall(call);
    expect(h.inserts.map((insert) => insert.table)).toEqual(["wireline_call_logs"]);
  });
});

describe("the queued missed-call alert", () => {
  it("emails the owner once per call", async () => {
    await handleMissedCallAlertJob(alertJob());
    expect(h.sendTenantEmail).toHaveBeenCalledOnce();
    expect(h.sendTenantEmail.mock.calls[0][0]).toMatchObject({
      userId: OWNER,
      action: "missed_call_owner_notification",
      to: "owner@example.test",
      subject: "Missed call from +15125550100",
      idempotencyKey: "missed-call/CA123",
    });
  });

  it("fails so the queue retries when the email is not accepted", async () => {
    h.sendTenantEmail.mockResolvedValue({ ok: false, disposition: "failed", error: "Resend 503" });
    await expect(handleMissedCallAlertJob(alertJob())).rejects.toThrow("Resend 503");
    h.sendTenantEmail.mockResolvedValue({ ok: false, disposition: "suppressed" });
    await expect(handleMissedCallAlertJob(alertJob())).resolves.toBeUndefined();
  });

  it("stands down when the caller left a voicemail, which emailed the owner itself", async () => {
    h.callRow = { outcomeTag: "voicemail" };
    await handleMissedCallAlertJob(alertJob());
    expect(h.sendTenantEmail).not.toHaveBeenCalled();
  });

  it("still alerts when a voicemail caller hung up without recording", async () => {
    process.env.WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED = "true";
    await handleMissedCallAlertJob(alertJob());
    expect(h.sendTenantEmail).toHaveBeenCalledOnce();
  });

  it("keeps the hourly alert cap", async () => {
    h.recentMissed = 11;
    await handleMissedCallAlertJob(alertJob());
    expect(h.sendTenantEmail).not.toHaveBeenCalled();
  });

  it("refuses a job whose payload names another account", async () => {
    await expect(
      handleMissedCallAlertJob({ ...alertJob(), userId: "00000000-0000-4000-8000-0000000000bb" }),
    ).rejects.toThrow("invalid payload");
    await expect(handleMissedCallAlertJob(alertJob({ reason: "made_up" }))).rejects.toThrow(
      "invalid payload",
    );
    expect(h.sendTenantEmail).not.toHaveBeenCalled();
  });

  it("is routed by the job worker", () => {
    const worker = readFileSync(resolve(process.cwd(), "src/lib/job-worker-base.ts"), "utf8");
    expect(worker).toContain(`if (job.type === "${MISSED_CALL_ALERT_JOB}") {`);
    expect(worker).toContain("await handleMissedCallAlertJob(job);");
  });
});
