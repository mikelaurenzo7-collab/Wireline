import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  reserve: vi.fn(),
  release: vi.fn(),
  retain: vi.fn(),
  daily: vi.fn(),
  rows: new Map<bigint, any>(),
  receipts: new Map<string, any>(),
  failUpdate: false,
  tail: Promise.resolve() as Promise<unknown>,
}));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: h.reserve,
  releasePlatformCostReservationIfReserved: h.release,
  markPlatformCostReservationAmbiguous: h.retain,
}));
vi.mock("../src/lib/spend-guards", () => ({
  clearBudgetCache: vi.fn(),
  recordDailySpend: h.daily,
}));
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
}));
vi.mock("../src/db/schema", () => ({
  auditLog: {
    __name: "audit",
    id: "id",
    userId: "userId",
    action: "action",
    provider: "provider",
    metadata: "metadata",
  },
  spendBudgets: { __name: "budget", userId: "userId" },
}));
vi.mock("../src/lib/server-context", () => {
  const match = (row: any, filter: any): boolean =>
    Array.isArray(filter) && typeof filter[0] === "string"
      ? row[filter[0]] === filter[1]
      : (filter || []).every((part: any) => match(row, part));
  const query = (operation: string, source?: any) => {
    let table = source?.__name,
      filter: any,
      values: any;
    const chain: any = {
      from(value: any) {
        table = value.__name;
        return chain;
      },
      where(value: any) {
        filter = value;
        return chain;
      },
      for() {
        return chain;
      },
      limit() {
        return chain;
      },
      values(value: any) {
        values = value;
        return chain;
      },
      set(value: any) {
        values = value;
        return chain;
      },
      onConflictDoNothing() {
        return chain;
      },
      returning() {
        return chain;
      },
      then(resolve: any, reject: any) {
        return Promise.resolve()
          .then(() => {
            if (table === "budget") return [{}];
            if (operation === "insert") {
              const key = `${values.userId}:${values.action}:${values.idempotencyKey}`;
              if (h.receipts.has(key)) return [];
              h.receipts.set(key, values);
              return [{ id: 100n }];
            }
            const row = [...h.rows.values()].find((value) => match(value, filter));
            if (!row) return [];
            if (operation === "update") {
              if (h.failUpdate) throw new Error("write interrupted");
              h.rows.set(row.id, { ...row, ...values });
            }
            return [row];
          })
          .then(resolve, reject);
      },
    };
    return chain;
  };
  const tx = {
    select: () => query("select"),
    insert: (table: any) => query("insert", table),
    update: (table: any) => query("update", table),
  };
  return {
    drizzle: {
      transaction(fn: (tx: any) => Promise<unknown>) {
        const work = h.tail.then(async () => {
          const before = structuredClone(h.rows),
            receipts = new Map(h.receipts);
          try {
            return await fn(tx);
          } catch (error) {
            h.rows = before;
            h.receipts = receipts;
            throw error;
          }
        });
        h.tail = work.catch(() => undefined);
        return work;
      },
    },
  };
});
import {
  artifactContainerEvidence,
  reconcileArtifactContainerSpend,
  reserveArtifactContainerSpend,
} from "../src/lib/openai-artifact-spend";
const reservation = { auditId: 1n, userId: "tenant", costUsd: 0.03, adopted: false };
const payload = (...ids: string[]) => ({
  status: "completed",
  output: ids.map((container_id) => ({ type: "code_interpreter_call", container_id })),
});
function attempt(id: bigint) {
  return {
    id,
    userId: "tenant",
    action: "artifact.container.attempt",
    provider: "openai",
    costUsd: "0.03",
    metadata: { accounting_state: "reserved_before_provider" },
  };
}
beforeEach(() => {
  h.reserve.mockReset().mockResolvedValue({ reserved: true, reservation });
  h.release.mockReset();
  h.retain.mockReset();
  h.daily.mockReset();
  h.rows = new Map([
    [1n, attempt(1n)],
    [2n, attempt(2n)],
  ]);
  h.receipts.clear();
  h.failUpdate = false;
  h.tail = Promise.resolve();
});
describe("artifact container provider accounting", () => {
  it("creates separate conservative receipts for separate real provider attempts", async () => {
    await reserveArtifactContainerSpend("tenant");
    await reserveArtifactContainerSpend("tenant");
    expect(h.reserve.mock.calls[0][0]).toMatchObject({
      costUsd: 0.03,
      provider: "openai",
      model: "code-interpreter-1gb",
    });
    expect(h.reserve.mock.calls[0][0].idempotencyKey).not.toBe(
      h.reserve.mock.calls[1][0].idempotencyKey,
    );
  });
  it("replaces the provisional amount and counts each returned container once, including replay", async () => {
    await reconcileArtifactContainerSpend(reservation, payload("cntr_a", "cntr_a", "cntr_b"), 200);
    await reconcileArtifactContainerSpend(reservation, payload("cntr_a", "cntr_b"), 200);
    await reconcileArtifactContainerSpend({ ...reservation, auditId: 2n }, payload("cntr_a"), 200);
    expect(h.receipts.size).toBe(2);
    expect(h.rows.get(1n).costUsd).toBe("0");
    expect(h.rows.get(2n).costUsd).toBe("0");
    expect(h.daily).toHaveBeenCalledExactlyOnceWith(0.06);
  });
  it("releases an authoritative completed response with no tool invocation", async () => {
    await reconcileArtifactContainerSpend(reservation, payload(), 200);
    expect(h.release).toHaveBeenCalledWith(reservation);
    expect(h.retain).not.toHaveBeenCalled();
  });
  it("retains ambiguous outcomes and does not treat citations as an invoked container", async () => {
    const body = {
      output: [
        {
          type: "message",
          annotations: [{ type: "container_file_citation", container_id: "cntr_a" }],
        },
      ],
    };
    expect(artifactContainerEvidence(body).containerIds).toEqual([]);
    await reconcileArtifactContainerSpend(reservation, body, 500);
    expect(h.retain).toHaveBeenCalledWith(reservation);
    expect(h.release).not.toHaveBeenCalled();
  });
  it("keeps an unknown invocation reserve in addition to known distinct containers", async () => {
    await reconcileArtifactContainerSpend(
      reservation,
      {
        status: "completed",
        output: [...payload("cntr_a").output, { type: "code_interpreter_call" }],
      },
      200,
    );
    expect(h.receipts.size).toBe(1);
    expect(h.rows.get(1n).costUsd).toBe("0.03");
  });
  it("refuses a foreign-tenant receipt", async () => {
    h.rows.get(1n).userId = "other";
    await expect(
      reconcileArtifactContainerSpend(reservation, payload("cntr_a"), 200),
    ).rejects.toThrow("unavailable");
    expect(h.receipts.size).toBe(0);
  });
  it("rolls back container receipts with the attempt update and permits safe retry", async () => {
    h.failUpdate = true;
    await expect(
      reconcileArtifactContainerSpend(reservation, payload("cntr_a"), 200),
    ).rejects.toThrow("interrupted");
    expect(h.receipts.size).toBe(0);
    expect(h.rows.get(1n).costUsd).toBe("0.03");
    h.failUpdate = false;
    await reconcileArtifactContainerSpend(reservation, payload("cntr_a"), 200);
    expect(h.receipts.size).toBe(1);
    expect(h.rows.get(1n).costUsd).toBe("0");
  });
});
