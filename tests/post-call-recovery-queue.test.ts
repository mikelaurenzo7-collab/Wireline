import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ enqueue: vi.fn(), report: vi.fn(), events: [] as string[] }));
vi.mock("../src/lib/post-call-finalization-recovery", () => ({
  enqueuePostCallFinalizationRecovery: h.enqueue,
}));
vi.mock("../src/lib/error-reporter", () => ({ reportError: h.report }));
vi.mock("../src/lib/job-queue-base", () => ({
  DEFAULT_MAX_ATTEMPTS: 5,
  writeTransactionConfig: () => undefined,
  backoffSeconds: () => 30,
  enqueue: vi.fn(),
  getQueueStats: vi.fn(),
  formatJobWorkerSweepError: String,
}));

import { failJob, recoverStaleJobs } from "../src/lib/job-queue";

const userId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
function database(type = "post_call_digest", updated = true) {
  const row: Record<string, unknown> = {
    id,
    userId,
    type,
    status: "running",
    attempts: 5,
    maxAttempts: 5,
  };
  const query = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([row]).then(resolve),
    };
    return chain;
  };
  const tx = {
    select: query,
    execute: async () => {
      h.events.push("deletion_fence");
    },
    update: () => {
      let values: Record<string, unknown>;
      const chain = {
        set: (value: Record<string, unknown>) => {
          values = value;
          return chain;
        },
        where: () => chain,
        returning: async () => {
          h.events.push("parent_update");
          if (!updated) return [];
          Object.assign(row, values);
          return [row];
        },
      };
      return chain;
    },
  };
  const db = {
    select: query,
    transaction: async (work: (value: typeof tx) => Promise<unknown>) => {
      const before = { ...row };
      try {
        const result = await work(tx);
        h.events.push("commit");
        return result;
      } catch (error) {
        Object.assign(row, before);
        h.events.push("rollback");
        throw error;
      }
    },
  };
  return { db: db as unknown as Parameters<typeof failJob>[0], row, tx };
}

beforeEach(() => {
  h.events = [];
  h.report.mockReset();
  h.enqueue.mockReset().mockImplementation(async () => {
    h.events.push("stage_child");
    return { eligible: true, created: true };
  });
});

describe("critical recovery follows exact exhausted parent transitions", () => {
  it("stages only after a real dead transition and keeps purge's lock order", async () => {
    const { db, row, tx } = database();
    await failJob(db, { id, attempts: 5, maxAttempts: 5 }, "original error");
    expect(h.events).toEqual(["deletion_fence", "parent_update", "stage_child", "commit"]);
    expect(h.enqueue).toHaveBeenCalledWith(tx, { parentJobId: id, userId });
    expect(row).toMatchObject({ status: "dead", error: "original error", attempts: 5 });
    expect(h.report).toHaveBeenCalledOnce();
  });
  it("rolls back the dead transition if the recovery obligation cannot persist", async () => {
    const { db, row } = database();
    h.enqueue.mockRejectedValue(new Error("child insert failed"));
    await expect(
      failJob(db, { id, attempts: 5, maxAttempts: 5 }, "original error"),
    ).rejects.toThrow("child insert failed");
    expect(row.status).toBe("running");
    expect(h.events.at(-1)).toBe("rollback");
    expect(h.report).not.toHaveBeenCalled();
  });
  it("does not stage after a stale worker loses its attempt-fenced update", async () => {
    const { db } = database("post_call_digest", false);
    await failJob(db, { id, attempts: 5, maxAttempts: 5 }, "stale outcome");
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.report).not.toHaveBeenCalled();
  });
  it("does not stage during an ordinary retry", async () => {
    const { db, row } = database();
    await failJob(db, { id, attempts: 2, maxAttempts: 5 }, "retry");
    expect(row.status).toBe("pending");
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.events).not.toContain("deletion_fence");
  });
  it.each(["post_call_finalization_recovery", "post_call_enrichment", "twilio_fallback_reconcile"])(
    "never generates another child for %s exhaustion",
    async (type) => {
      const { db } = database(type);
      await failJob(db, { id, attempts: 5, maxAttempts: 5 }, "dead");
      expect(h.enqueue).not.toHaveBeenCalled();
      expect(h.report).toHaveBeenCalledOnce();
    },
  );
  it("also stages after the last attempt dies without returning to failJob", async () => {
    const { db, row, tx } = database();
    expect(await recoverStaleJobs(db)).toBe(1);
    expect(h.events).toEqual(["deletion_fence", "parent_update", "stage_child", "commit"]);
    expect(h.enqueue).toHaveBeenCalledWith(tx, { parentJobId: id, userId });
    expect(row.status).toBe("dead");
  });
  it("does not stage stale recovery after another worker already changed the row", async () => {
    const { db } = database("post_call_digest", false);
    expect(await recoverStaleJobs(db)).toBe(0);
    expect(h.enqueue).not.toHaveBeenCalled();
  });
  it("does not recursively stage a child whose last running attempt became stale", async () => {
    const { db } = database("post_call_finalization_recovery");
    expect(await recoverStaleJobs(db)).toBe(1);
    expect(h.enqueue).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "commits candidates before the next barrier and preserves counts after later rollback=%s",
    async (failSecond) => {
      const rows = [
        { id, userId, type: "post_call_digest", attempts: 5, maxAttempts: 5 },
        {
          id: "33333333-3333-4333-8333-333333333333",
          userId,
          type: "post_call_digest",
          attempts: 5,
          maxAttempts: 5,
        },
      ];
      const events: string[] = [];
      let active = false;
      let index = 0;
      const select = () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: async () => rows,
        };
        return chain;
      };
      const db = {
        select,
        transaction: async (work: (tx: unknown) => Promise<unknown>) => {
          expect(active).toBe(false);
          active = true;
          const current = index++;
          events.push(`begin${current}`);
          const tx = {
            execute: async () => {
              events.push(`fence${current}`);
            },
            update: () => {
              const chain = {
                set: () => chain,
                where: () => chain,
                returning: async () => {
                  if (current === 1 && failSecond) throw new Error("second candidate rolled back");
                  return current === 0 ? [{ ...rows[current], status: "dead" }] : [];
                },
              };
              return chain;
            },
          };
          try {
            const result = await work(tx);
            events.push(`commit${current}`);
            return result;
          } catch (error) {
            events.push(`rollback${current}`);
            throw error;
          } finally {
            active = false;
          }
        },
      };
      expect(await recoverStaleJobs(db as unknown as Parameters<typeof recoverStaleJobs>[0])).toBe(
        1,
      );
      expect(events).toEqual([
        "begin0",
        "fence0",
        "commit0",
        "begin1",
        "fence1",
        failSecond ? "rollback1" : "commit1",
      ]);
      expect(h.enqueue).toHaveBeenCalledOnce();
      expect(h.report).toHaveBeenCalledTimes(failSecond ? 1 : 0);
    },
  );
});
