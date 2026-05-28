import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  backoffSeconds,
  DEFAULT_MAX_ATTEMPTS,
  enqueue,
  claimJob,
  completeJob,
  failJob,
} from "./job-queue";

// The job-queue functions accept the Drizzle handle as an argument, so we can
// pass a hand-rolled fake that records the chained `.set()` / `.values()`
// payloads. This lets us assert the money/identity-critical retry, exhaustion,
// and atomic-claim semantics without a live Postgres.

describe("backoffSeconds", () => {
  it("follows the 30s / 2m / 10m / 1h schedule", () => {
    expect(backoffSeconds(0)).toBe(30);
    expect(backoffSeconds(1)).toBe(120);
    expect(backoffSeconds(2)).toBe(600);
    expect(backoffSeconds(3)).toBe(3600);
  });

  it("clamps to the final bucket for attempts beyond the schedule", () => {
    expect(backoffSeconds(4)).toBe(3600);
    expect(backoffSeconds(99)).toBe(3600);
  });

  it("DEFAULT_MAX_ATTEMPTS is schedule length + 1", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5);
  });
});

describe("enqueue", () => {
  it("inserts a pending job with attempts=0 and default max attempts, returning the id", async () => {
    const captured: Record<string, unknown> = {};
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn((vals: Record<string, unknown>) => {
          Object.assign(captured, vals);
          return { returning: vi.fn(() => Promise.resolve([{ id: "job_1" }])) };
        }),
      })),
    } as any;

    const res = await enqueue(db, {
      userId: "user_a",
      type: "webhook_delivery",
      payload: { to: "x@y.z" },
    });

    expect(res).toEqual({ ok: true, jobId: "job_1" });
    expect(captured.userId).toBe("user_a");
    expect(captured.status).toBe("pending");
    expect(captured.attempts).toBe(0);
    expect(captured.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it("returns ok:false with the error message when the insert throws", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.reject(new Error("unique violation"))),
        })),
      })),
    } as any;

    const res = await enqueue(db, { userId: "u", type: "webhook_delivery", payload: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("unique violation");
  });
});

describe("claimJob", () => {
  it("returns null when no pending job is available (idle queue)", async () => {
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ for: vi.fn(() => Promise.resolve([])) })),
            })),
          })),
        })),
      })),
      update: vi.fn(),
    };
    const db = { transaction: vi.fn((cb: any) => cb(tx)) } as any;

    const claimed = await claimJob(db);
    expect(claimed).toBeNull();
    // No row → no UPDATE issued.
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("atomically claims a pending job: marks running and increments attempts", async () => {
    const setArg: Record<string, unknown> = {};
    const job = { id: "job_42", attempts: 1, status: "pending" };
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ for: vi.fn(() => Promise.resolve([job])) })),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: Record<string, unknown>) => {
          Object.assign(setArg, vals);
          return {
            where: vi.fn(() => ({
              returning: vi.fn(() => Promise.resolve([{ ...job, status: "running", attempts: 2 }])),
            })),
          };
        }),
      })),
    };
    const db = { transaction: vi.fn((cb: any) => cb(tx)) } as any;

    const claimed = await claimJob(db);
    expect(claimed).toMatchObject({ id: "job_42", status: "running", attempts: 2 });
    expect(setArg.status).toBe("running");
    // attempts incremented from the claimed row's value (1 → 2).
    expect(setArg.attempts).toBe(2);
    expect(setArg.startedAt).toBeInstanceOf(Date);
  });
});

describe("completeJob", () => {
  it("marks the job done and clears the error", async () => {
    const setArg: Record<string, unknown> = {};
    const db = {
      update: vi.fn(() => ({
        set: vi.fn((vals: Record<string, unknown>) => {
          Object.assign(setArg, vals);
          return { where: vi.fn(() => Promise.resolve()) };
        }),
      })),
    } as any;

    await completeJob(db, "job_7");
    expect(setArg.status).toBe("done");
    expect(setArg.error).toBeNull();
    expect(setArg.finishedAt).toBeInstanceOf(Date);
  });
});

describe("failJob", () => {
  let setArg: Record<string, unknown>;
  let db: any;

  beforeEach(() => {
    setArg = {};
    db = {
      update: vi.fn(() => ({
        set: vi.fn((vals: Record<string, unknown>) => {
          Object.assign(setArg, vals);
          return { where: vi.fn(() => Promise.resolve()) };
        }),
      })),
    };
  });

  it("reschedules a retryable failure with the backoff window", async () => {
    const before = Date.now();
    await failJob(db, { id: "j", attempts: 1, maxAttempts: 5 }, "boom");
    const after = Date.now();

    expect(setArg.status).toBe("failed");
    expect(setArg.finishedAt).toBeNull();
    expect(setArg.error).toBe("boom");
    // attempts=1 → backoff bucket index 1 = 120s.
    const nextRun = (setArg.runAt as Date).getTime();
    expect(nextRun).toBeGreaterThanOrEqual(before + 120_000);
    expect(nextRun).toBeLessThanOrEqual(after + 120_000);
  });

  it("dead-letters once attempts have reached maxAttempts (idempotent exhaustion)", async () => {
    await failJob(db, { id: "j", attempts: 5, maxAttempts: 5 }, "fatal");
    expect(setArg.status).toBe("dead");
    expect(setArg.finishedAt).toBeInstanceOf(Date);
  });

  it("truncates very long error messages to 2000 chars", async () => {
    const huge = "e".repeat(5000);
    await failJob(db, { id: "j", attempts: 0, maxAttempts: 5 }, huge);
    expect((setArg.error as string).length).toBe(2000);
  });
});
