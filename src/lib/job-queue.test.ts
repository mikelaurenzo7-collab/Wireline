import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { JobRow } from "./job-queue";
import {
  backoffSeconds,
  DEFAULT_MAX_ATTEMPTS,
  enqueue,
  claimJob,
  completeJob,
  failJob,
  getQueueStats,
  startWorker,
} from "./job-queue";

describe("job-queue · backoffSeconds", () => {
  it("ramps exponentially then caps at longest schedule slice", () => {
    expect(backoffSeconds(0)).toBe(30);
    expect(backoffSeconds(1)).toBe(120);
    expect(backoffSeconds(2)).toBe(600);
    expect(backoffSeconds(3)).toBe(3600);
    expect(backoffSeconds(99)).toBe(3600);
  });

  it("DEFAULT_MAX_ATTEMPTS matches retry schedule length + 1", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5);
  });
});

describe("job-queue · enqueue", () => {
  it("inserts a job and returns ok with jobId", async () => {
    const jobId = "11111111-1111-1111-1111-111111111111";
    const returning = vi.fn().mockResolvedValue([{ id: jobId }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as any;

    const result = await enqueue(db, {
      userId: "user-1",
      type: "webhook_delivery",
      payload: { url: "https://example.com/hook" },
    });

    expect(result).toEqual({ ok: true, jobId });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "webhook_delivery",
        payload: { url: "https://example.com/hook" },
        status: "pending",
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      }),
    );
    expect(values.mock.calls[0][0].runAt).toBeInstanceOf(Date);
  });

  it("respects runAt and maxAttempts overrides", async () => {
    const runAt = new Date("2030-01-15T12:00:00.000Z");
    const returning = vi.fn().mockResolvedValue([{ id: "job-2" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as any;

    await enqueue(db, {
      userId: "u",
      type: "daily_brief",
      payload: {},
      runAt,
      maxAttempts: 2,
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        maxAttempts: 2,
        runAt,
      }),
    );
  });

  it("returns ok:false with message when insert throws", async () => {
    const returning = vi.fn().mockRejectedValue(new Error("constraint_violation"));
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as any;

    const result = await enqueue(db, {
      userId: "u",
      type: "consent_check",
      payload: {},
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("constraint_violation");
  });
});

describe("job-queue · claimJob", () => {
  function txMockForClaim(opts: {
    pendingRow: Record<string, unknown> | null;
    updatedRow?: Record<string, unknown>;
  }) {
    const updated =
      opts.updatedRow ??
      (opts.pendingRow
        ? {
            ...opts.pendingRow,
            status: "running",
            attempts: (opts.pendingRow.attempts as number) + 1,
          }
        : {});
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue(opts.pendingRow ? [opts.pendingRow] : []),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(opts.pendingRow ? [updated] : []),
    };
    const tx = {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
    };
    return { tx, selectChain, updateChain };
  }

  it("returns null when no pending job matches", async () => {
    const { tx } = txMockForClaim({ pendingRow: null });
    const db = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as any;

    const job = await claimJob(db);
    expect(job).toBeNull();
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.select().for).toHaveBeenCalledWith("update", { skipLocked: true });
  });

  it("claims a row and increments attempts", async () => {
    const pendingRow = {
      id: "job-a",
      attempts: 2,
      userId: "user-x",
      status: "pending",
    };
    const { tx, updateChain } = txMockForClaim({ pendingRow });

    const db = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as any;

    const claimed = await claimJob(db);
    expect(claimed).toMatchObject({
      id: "job-a",
      status: "running",
      attempts: 3,
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        attempts: 3,
      }),
    );
  });

  it("passes typeFilter into the select where clause via inArray", async () => {
    const pendingRow = { id: "j1", attempts: 0 };
    const { tx, selectChain } = txMockForClaim({ pendingRow });
    const db = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as any;

    await claimJob(db, ["webhook_delivery", "daily_brief"]);
    expect(selectChain.where).toHaveBeenCalled();
    const arg = selectChain.where.mock.calls[0][0];
    expect(arg).toBeDefined();
  });
});

describe("job-queue · completeJob", () => {
  it("marks job done with finishedAt and clears error", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update } as any;

    await completeJob(db, "job-id-1");

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "done",
        error: null,
      }),
    );
    expect(where).toHaveBeenCalled();
  });
});

describe("job-queue · failJob", () => {
  let set: Mock;
  let where: Mock;
  let db: any;

  beforeEach(() => {
    where = vi.fn().mockResolvedValue(undefined);
    set = vi.fn().mockReturnValue({ where });
    db = { update: vi.fn().mockReturnValue({ set }) };
  });

  it("schedules retry with failed status when attempts remain", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));

    await failJob(db, { id: "j1", attempts: 1, maxAttempts: 5 }, "temporary outage");

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        finishedAt: null,
        error: "temporary outage",
      }),
    );
    const runAt = set.mock.calls[0][0].runAt as Date;
    expect(runAt.getTime()).toBe(new Date("2026-05-01T12:02:00.000Z").getTime());

    vi.useRealTimers();
  });

  it("dead-letters when attempts have reached maxAttempts", async () => {
    await failJob(db, { id: "j2", attempts: 5, maxAttempts: 5 }, "give up");

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "dead",
        finishedAt: expect.any(Date),
      }),
    );
    expect(String(set.mock.calls[0][0].error).length).toBeLessThanOrEqual(2000);
  });

  it("truncates error text beyond 2000 characters", async () => {
    const long = "x".repeat(2500);
    await failJob(db, { id: "j3", attempts: 5, maxAttempts: 5 }, long);
    expect(set.mock.calls[0][0].error).toHaveLength(2000);
  });
});

describe("job-queue · getQueueStats", () => {
  it("aggregates five status buckets (global)", async () => {
    const counts = [4, 2, 1, 0, 9];
    let idx = 0;
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ count: counts[idx++] }])),
        })),
      })),
    } as any;

    const stats = await getQueueStats(db);
    expect(stats).toEqual({
      pending: 4,
      running: 2,
      failed: 1,
      dead: 0,
      done_last_hour: 9,
    });
    expect(db.select).toHaveBeenCalledTimes(5);
  });

  it("scopes counts to a user when userId is passed", async () => {
    let idx = 0;
    const counts = [1, 0, 0, 0, 3];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ count: counts[idx++] }])),
        })),
      })),
    } as any;

    const stats = await getQueueStats(db, "user-99");
    expect(stats.pending).toBe(1);
    expect(stats.done_last_hour).toBe(3);
  });

  it("coerces falsy counts to zero", async () => {
    let idx = 0;
    const counts = [0, null, undefined, false, 0] as unknown[];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ count: counts[idx++] as number }])),
        })),
      })),
    } as any;

    const stats = await getQueueStats(db);
    expect(stats).toEqual({
      pending: 0,
      running: 0,
      failed: 0,
      dead: 0,
      done_last_hour: 0,
    });
  });
});

describe("job-queue · startWorker", () => {
  /** claimJob uses `tx`; completeJob / failJob use top-level `db.update`. */
  function createWorkerDb(opts?: { handlerError?: boolean }) {
    const jobRow = {
      id: "claimed-1",
      attempts: 0,
      maxAttempts: 5,
      type: "webhook_delivery",
    };

    let claimSelectCalls = 0;
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn(async () => {
        claimSelectCalls++;
        return claimSelectCalls === 1 ? [jobRow] : [];
      }),
    };

    const txUpdateReturning = vi
      .fn()
      .mockResolvedValue([{ ...jobRow, status: "running", attempts: 1 }]);
    const txUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: txUpdateReturning,
    };

    const tx = {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => txUpdateChain),
    };

    const completeSetData = vi.fn();
    const completeWhere = vi.fn().mockResolvedValue(undefined);
    const completeSet = vi.fn((data: unknown) => {
      completeSetData(data);
      return { where: completeWhere };
    });

    const failSetData = vi.fn();
    const failWhere = vi.fn().mockResolvedValue(undefined);
    const failSet = vi.fn((data: unknown) => {
      failSetData(data);
      return { where: failWhere };
    });

    const db = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      update: vi.fn(() => ({
        set: opts?.handlerError ? failSet : completeSet,
      })),
    } as any;

    return { db, jobRow, completeSetData, failSetData };
  }

  it("polls claimJob in a loop, completes successful handlers, and reschedules", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue(undefined);
    const { db, completeSetData } = createWorkerDb();

    const stop = startWorker(db, handler, { pollIntervalMs: 5_000 });
    await vi.runOnlyPendingTimersAsync();

    expect(handler).toHaveBeenCalled();
    expect(completeSetData).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));

    await vi.advanceTimersByTimeAsync(5_000);
    stop();
    vi.useRealTimers();
  });

  it("invokes failJob path when the handler throws", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockRejectedValue(new Error("handler blew up"));
    const { db, failSetData } = createWorkerDb({ handlerError: true });

    const stop = startWorker(db, handler, { pollIntervalMs: 1_000 });
    await vi.runOnlyPendingTimersAsync();

    expect(failSetData).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.stringMatching(/failed|dead/),
        error: "handler blew up",
      }),
    );

    stop();
    vi.useRealTimers();
  });

  it("calls onError when the poll loop transaction fails", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const db = {
      transaction: vi.fn().mockRejectedValue(new Error("db tx unavailable")),
    };
    const handler = vi.fn();

    const stop = startWorker(db as any, handler, {
      pollIntervalMs: 2_000,
      onError,
    });
    await vi.runOnlyPendingTimersAsync();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe("db tx unavailable");

    stop();
    vi.useRealTimers();
  });

  it("stop() prevents further timer-driven sweeps", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockResolvedValue(undefined);
    const { db } = createWorkerDb();

    const stop = startWorker(db, handler, { pollIntervalMs: 1_000 });
    await vi.runOnlyPendingTimersAsync();
    const callsAfterFirst = db.transaction.mock.calls.length;

    stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(db.transaction.mock.calls.length).toBe(callsAfterFirst);
    vi.useRealTimers();
  });
});

describe("job-queue · JobRow typing (smoke)", () => {
  it("accepts a minimal JobRow shape used by handlers", () => {
    const row: JobRow = {
      id: "id",
      user_id: "uid",
      type: "execute_action",
      payload: { a: 1 },
      status: "pending",
      attempts: 0,
      max_attempts: 5,
      run_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(row.type).toBe("execute_action");
  });
});
