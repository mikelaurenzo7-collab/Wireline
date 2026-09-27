import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it, vi } from "vitest";
import { enqueue, type EnqueueOptions } from "../src/lib/job-queue-base";
import { enforceDurableEnqueueResult } from "../src/lib/job-queue";

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  tenantStore: { getStore: () => undefined },
}));

function database(options: { rows?: unknown[][]; error?: Error } = {}) {
  const statements: string[] = [];
  const queryDb = drizzle(async (query) => {
    statements.push(query);
    if (options.error) throw options.error;
    return { rows: options.rows ?? [["queued-job"]] };
  });
  const db = {
    transaction: async (operation: (tx: typeof queryDb) => Promise<unknown>) => operation(queryDb),
  } as unknown as Parameters<typeof enqueue>[0];
  return { db, statements };
}

const tenant = "00000000-0000-4000-8000-000000000001";
const input = (type: EnqueueOptions["type"]): EnqueueOptions => ({
  userId: tenant,
  type,
  payload: {},
});

describe("quiet scheduler singleton admission", () => {
  it.each(["cadence_tick", "callback_tick"] as const)(
    "%s preserves active work through the exact partial-index conflict target",
    async (type) => {
      const { db, statements } = database({ rows: [] });
      expect(await enqueue(db, input(type))).toEqual({ ok: true });
      expect(statements).toHaveLength(1);
      expect(statements[0]).toContain('on conflict ("user_id","type")');
      expect(statements[0]).toContain("type IN ('cadence_tick', 'callback_tick')");
      expect(statements[0]).toContain("status IN ('pending', 'running', 'failed') do nothing");
      expect(statements[0]).not.toContain("do update");
    },
  );

  it("returns the persisted identity for a newly queued tick", async () => {
    const { db } = database();
    expect(await enqueue(db, input("cadence_tick"))).toEqual({ ok: true, jobId: "queued-job" });
  });

  it("does not suppress uniqueness errors for ordinary durable jobs", async () => {
    const { db, statements } = database({ error: new Error("unrelated unique constraint") });
    const result = await enqueue(db, input("daily_brief"));
    expect(result.ok).toBe(false);
    expect(statements[0]).not.toContain("on conflict");
    expect(() => enforceDurableEnqueueResult(input("daily_brief"), result)).toThrow();
  });

  it("keeps unexpected scheduler storage failures visible", async () => {
    const { db } = database({ error: new Error("connection unavailable") });
    const result = await enqueue(db, input("callback_tick"));
    expect(result.ok).toBe(false);
    expect(() => enforceDurableEnqueueResult(input("callback_tick"), result)).toThrow();
  });

  it("refuses to acknowledge a normal job without a returned persisted identity", async () => {
    const { db } = database({ rows: [] });
    expect(await enqueue(db, input("daily_brief"))).toMatchObject({ ok: false });
  });
});
