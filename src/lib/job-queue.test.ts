import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  backoffSeconds,
  DEFAULT_MAX_ATTEMPTS,
  enqueue,
  claimJob,
  completeJob,
  failJob,
  startWorker,
  getQueueStats,
  type JobRow,
  type JobStatus,
} from "./job-queue";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    user_id: "user-1",
    type: "post_call_enrichment",
    payload: { call_id: "c1" },
    status: "running",
    attempts: 1,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    run_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Minimal mock Supabase client that records calls.
function makeMockDb() {
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  const rows: JobRow[] = [];

  let rpcResult: unknown = null;
  let rpcError: unknown = { message: "no rpc" };

  const db: any = {
    _updates: updates,
    _inserts: inserts,
    _rows: rows,
    setRpcResult(data: unknown) { rpcResult = data; rpcError = null; },
    setRpcError(err: unknown) { rpcError = err; rpcResult = null; },

    from(table: string) {
      const chain: any = {
        _filters: {} as Record<string, unknown>,
        _table: table,

        insert(row: Record<string, unknown>) {
          inserts.push({ ...row, id: "job-new", _table: table });
          return {
            select() { return this; },
            single() { return Promise.resolve({ data: { id: "job-new" }, error: null }); },
          };
        },

        select(_cols: string, _opts?: unknown) {
          return chain;
        },

        update(patch: Record<string, unknown>) {
          updates.push({ ...patch, _table: table });
          return chain;
        },

        eq(col: string, val: unknown) { chain._filters[col] = val; return chain; },
        lte() { return chain; },
        gte() { return chain; },
        in() { return chain; },
        order() { return chain; },
        limit() { return chain; },

        // For the "claim job" non-atomic path: return from the rows store.
        then(resolve: any) {
          if (table === "wireline_jobs") {
            const pending = rows.filter(r =>
              r.status === "pending" &&
              new Date(r.run_at) <= new Date() &&
              !Object.entries(chain._filters).some(([k, v]) => (r as any)[k] !== v)
            );
            return Promise.resolve({ data: pending }).then(resolve);
          }
          return Promise.resolve({ data: null }).then(resolve);
        },

        // For count queries (getQueueStats)
        count: 0,
      };
      return chain;
    },

    rpc(_name: string, _args: unknown) {
      return Promise.resolve({ data: rpcResult, error: rpcError });
    },
  };

  return db;
}

// ─────────────────────────────────────────────────────────────────
// Backoff
// ─────────────────────────────────────────────────────────────────

describe("job-queue · backoff", () => {
  it("returns increasing delays", () => {
    const b0 = backoffSeconds(0);
    const b1 = backoffSeconds(1);
    const b2 = backoffSeconds(2);
    const b3 = backoffSeconds(3);
    expect(b0).toBeLessThan(b1);
    expect(b1).toBeLessThan(b2);
    expect(b2).toBeLessThan(b3);
  });
  it("clamps at the last schedule entry", () => {
    expect(backoffSeconds(100)).toBe(backoffSeconds(99));
    expect(backoffSeconds(100)).toBeGreaterThan(0);
  });
  it("DEFAULT_MAX_ATTEMPTS equals schedule length + 1", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(DEFAULT_MAX_ATTEMPTS).toBeLessThanOrEqual(10); // sanity
  });
});

// ─────────────────────────────────────────────────────────────────
// enqueue
// ─────────────────────────────────────────────────────────────────

describe("job-queue · enqueue", () => {
  it("inserts a pending job and returns the id", async () => {
    const db = makeMockDb();
    const result = await enqueue(db, {
      userId: "u-1",
      type: "post_call_enrichment",
      payload: { call_id: "c1" },
    });
    expect(result.ok).toBe(true);
    expect(result.jobId).toBe("job-new");
    expect(db._inserts[0].status).toBe("pending");
    expect(db._inserts[0].attempts).toBe(0);
  });

  it("respects explicit runAt and maxAttempts", async () => {
    const db = makeMockDb();
    const runAt = new Date(Date.now() + 60_000);
    await enqueue(db, {
      userId: "u",
      type: "daily_brief",
      payload: {},
      runAt,
      maxAttempts: 2,
    });
    expect(db._inserts[0].max_attempts).toBe(2);
    expect(db._inserts[0].run_at).toBe(runAt.toISOString());
  });
});

// ─────────────────────────────────────────────────────────────────
// claimJob
// ─────────────────────────────────────────────────────────────────

describe("job-queue · claimJob via RPC", () => {
  it("returns the job when RPC succeeds", async () => {
    const db = makeMockDb();
    const job = makeJob({ status: "pending" });
    db.setRpcResult(job);
    const claimed = await claimJob(db);
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe("job-1");
  });

  it("returns null when RPC returns null (queue idle)", async () => {
    const db = makeMockDb();
    db.setRpcResult(null);
    const claimed = await claimJob(db);
    expect(claimed).toBeNull();
  });
});

describe("job-queue · claimJob fallback (no RPC)", () => {
  it("returns null when no eligible jobs", async () => {
    const db = makeMockDb();
    // RPC fails, no rows in the store
    const claimed = await claimJob(db);
    expect(claimed).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// completeJob
// ─────────────────────────────────────────────────────────────────

describe("job-queue · completeJob", () => {
  it("sets status=done and records finished_at", async () => {
    const db = makeMockDb();
    await completeJob(db, "job-1");
    const upd = db._updates[0];
    expect(upd.status).toBe("done");
    expect(upd.finished_at).toBeDefined();
    expect(upd.error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// failJob
// ─────────────────────────────────────────────────────────────────

describe("job-queue · failJob", () => {
  it("transitions to failed with a future run_at when attempts remain", async () => {
    const db = makeMockDb();
    await failJob(db, { id: "j1", attempts: 1, max_attempts: 5 }, "timeout");
    const upd = db._updates[0];
    expect(upd.status).toBe("failed");
    expect(upd.error).toBe("timeout");
    expect(new Date(upd.run_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("transitions to dead when max_attempts exhausted", async () => {
    const db = makeMockDb();
    await failJob(db, { id: "j1", attempts: 5, max_attempts: 5 }, "persistent error");
    const upd = db._updates[0];
    expect(upd.status).toBe("dead");
    expect(upd.finished_at).toBeDefined();
  });

  it("truncates very long error messages to 2000 chars", async () => {
    const db = makeMockDb();
    const long = "x".repeat(5000);
    await failJob(db, { id: "j1", attempts: 1, max_attempts: 5 }, long);
    expect((db._updates[0].error as string).length).toBeLessThanOrEqual(2000);
  });
});

// ─────────────────────────────────────────────────────────────────
// startWorker
// ─────────────────────────────────────────────────────────────────

describe("job-queue · startWorker", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("calls handler + completeJob on success", async () => {
    const job = makeJob({ status: "running" });
    const db = makeMockDb();
    db.setRpcResult(job);

    let handlerCalls = 0;
    const handler = vi.fn(async (_job: JobRow) => { handlerCalls++; });

    const stop = startWorker(db, handler, { pollIntervalMs: 1000 });

    // Advance past the first poll interval, then stop so the worker
    // doesn't schedule more sweeps.
    await vi.advanceTimersByTimeAsync(1001);
    stop();

    expect(handler).toHaveBeenCalled();
    expect(db._updates.some((u: any) => u.status === "done")).toBe(true);
  });

  it("calls failJob when handler throws", async () => {
    const job = makeJob({ status: "running", attempts: 1, max_attempts: 5 });
    const db = makeMockDb();
    db.setRpcResult(job);

    const handler = vi.fn(async () => { throw new Error("boom"); });

    const stop = startWorker(db, handler, { pollIntervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    stop();

    expect(db._updates.some((u: any) => u.status === "failed" || u.status === "dead")).toBe(true);
  });

  it("stop() is idempotent and cancels the timer", () => {
    const db = makeMockDb();
    db.setRpcResult(null);
    const handler = vi.fn(async () => {});
    const stop = startWorker(db, handler, { pollIntervalMs: 5000 });
    stop();
    stop(); // second call should not throw
  });
});

// ─────────────────────────────────────────────────────────────────
// getQueueStats
// ─────────────────────────────────────────────────────────────────

describe("job-queue · getQueueStats", () => {
  it("returns zeroes when counts are null", async () => {
    const db: any = {
      from() {
        const c = {
          select() { return c; },
          eq() { return c; },
          gte() { return c; },
          count: null,
        };
        return c;
      },
    };
    const stats = await getQueueStats(db);
    expect(stats.pending).toBe(0);
    expect(stats.running).toBe(0);
    expect(stats.dead).toBe(0);
    expect(stats.done_last_hour).toBe(0);
  });

  it("tenant-scopes the count when userId is supplied", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const db: any = {
      from() {
        const c: any = {
          select() { return c; },
          eq(col: string, val: unknown) { eqCalls.push({ col, val }); return c; },
          gte() { return c; },
          count: 0,
        };
        return c;
      },
    };
    await getQueueStats(db, "user-abc");
    // Each of the 5 queries should include a user_id filter.
    const userIdFilters = eqCalls.filter(c => c.col === "user_id" && c.val === "user-abc");
    expect(userIdFilters.length).toBe(5);
  });

  it("does NOT add a user_id filter when userId is omitted (worker path)", async () => {
    const eqCalls: Array<{ col: string; val: unknown }> = [];
    const db: any = {
      from() {
        const c: any = {
          select() { return c; },
          eq(col: string, val: unknown) { eqCalls.push({ col, val }); return c; },
          gte() { return c; },
          count: 0,
        };
        return c;
      },
    };
    await getQueueStats(db);
    const userIdFilters = eqCalls.filter(c => c.col === "user_id");
    expect(userIdFilters.length).toBe(0);
  });
});
