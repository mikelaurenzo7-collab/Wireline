import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { sendCurrentTrialReminder } from "../src/lib/trial-ending-reminder";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = Date.parse("2026-10-27T12:00:00Z");
const hour = 60 * 60 * 1000;
const job = { id: "job-1", user_id: owner, payload: { userId: owner, daysLeft: 99 } };
const current = {
  email: "owner@example.com",
  status: "trialing",
  trialEndsAt: new Date(now + 25 * hour),
};

function dependencies(snapshot: typeof current | undefined = current) {
  return {
    load: vi.fn().mockResolvedValue(snapshot),
    send: vi.fn().mockResolvedValue({ ok: true, disposition: "accepted", provider: "resend" }),
    now: () => now,
  };
}

describe("queued trial reminder", () => {
  it("loads the matching owner's settings and user before sending", () => {
    const worker = readFileSync("src/lib/job-worker-base.ts", "utf8");
    const start = worker.indexOf('if (job.type === "trial_ending_soon_email")');
    const end = worker.indexOf('if (job.type === "usage_meter_report")', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handler = worker.slice(start, end);
    expect(handler).toContain("sendCurrentTrialReminder(job");
    expect(handler).toContain(
      ".innerJoin(schema.users, eq(schema.users.id, schema.settings.userId))",
    );
    expect(handler).toContain(".where(eq(schema.settings.userId, userId))");
    expect(handler).toContain("throw err");
  });

  it("rechecks the owner and calculates the remaining days at execution", async () => {
    const deps = dependencies();
    await expect(sendCurrentTrialReminder(job, deps)).resolves.toEqual({
      status: "sent",
      userId: owner,
    });
    expect(deps.load).toHaveBeenCalledWith(owner);
    expect(deps.send).toHaveBeenCalledWith({
      userId: owner,
      to: current.email,
      daysLeft: 2,
      idempotencyKey: "trial-ending-soon/job-1",
    });
  });

  it.each([
    { ...current, status: "active" },
    { ...current, status: "canceled" },
    { ...current, trialEndsAt: new Date(now) },
    { ...current, trialEndsAt: new Date(now - hour) },
    { ...current, trialEndsAt: new Date(now + 73 * hour) },
    { ...current, trialEndsAt: new Date("invalid") },
    { ...current, email: "" },
  ])("skips when the current account is no longer eligible: %j", async (snapshot) => {
    const deps = dependencies(snapshot);
    await expect(sendCurrentTrialReminder(job, deps)).resolves.toMatchObject({ status: "skipped" });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("skips a missing settings or user row", async () => {
    const deps = dependencies();
    deps.load.mockResolvedValueOnce(undefined);
    await expect(sendCurrentTrialReminder(job, deps)).resolves.toMatchObject({ status: "skipped" });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("rejects a mismatched payload owner before reading or sending", async () => {
    const deps = dependencies();
    await expect(
      sendCurrentTrialReminder({ ...job, payload: { userId: other } }, deps),
    ).rejects.toMatchObject({ code: "INVALID_JOB_OWNER" });
    expect(deps.load).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("propagates database and provider failures for a retry", async () => {
    const loadFailure = dependencies();
    loadFailure.load.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(sendCurrentTrialReminder(job, loadFailure)).rejects.toThrow(
      "database unavailable",
    );
    expect(loadFailure.send).not.toHaveBeenCalled();

    const sendFailure = dependencies();
    sendFailure.send.mockResolvedValueOnce({
      ok: false,
      disposition: "failed",
      error: "provider unavailable",
    });
    await expect(sendCurrentTrialReminder(job, sendFailure)).rejects.toThrow(
      "provider unavailable",
    );
  });

  it("treats policy suppression as a completed non-send", async () => {
    const deps = dependencies();
    deps.send.mockResolvedValueOnce({ ok: false, disposition: "suppressed" });
    await expect(sendCurrentTrialReminder(job, deps)).resolves.toMatchObject({
      status: "suppressed",
    });
  });
});
