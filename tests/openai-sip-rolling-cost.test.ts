import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  row: { costUsd: "1", metadata: {} as Record<string, unknown> },
  tail: Promise.resolve(),
  failWrite: false,
  daily: vi.fn(),
  evaluate: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("drizzle-orm", () => ({
  and: (...x: unknown[]) => x,
  eq: (...x: unknown[]) => x,
  gte: (...x: unknown[]) => x,
  sql: () => "sql",
}));
vi.mock("../src/db/schema", () => ({
  spendBudgets: { table: "budget", userId: "userId" },
  auditLog: {
    table: "audit",
    id: "id",
    userId: "userId",
    costUsd: "costUsd",
    metadata: "metadata",
  },
}));
vi.mock("../src/lib/server-context", () => {
  const query = () => {
    let table = "";
    const chain: any = {
      from: (value: { table: string }) => {
        table = value.table;
        return chain;
      },
      where: () => chain,
      limit: () => chain,
      for: () => chain,
      then: (resolve: (rows: unknown[]) => void) =>
        Promise.resolve(
          table === "audit"
            ? [{ ...h.row, metadata: { ...h.row.metadata } }]
            : [{ userId: "tenant" }],
        ).then(resolve),
    };
    return chain;
  };
  const db: any = {
    select: query,
    update: () => ({
      set: (value: typeof h.row) => ({
        where: async () => {
          if (h.failWrite) {
            h.failWrite = false;
            throw new Error("temporary database failure");
          }
          h.row = value;
        },
      }),
    }),
    transaction: async (perform: (tx: unknown) => Promise<unknown>) => {
      const previous = h.tail;
      let release!: () => void;
      h.tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await perform(db);
      } finally {
        release();
      }
    },
  };
  return { drizzle: db, log: { error: vi.fn() }, quotaTracker: {} };
});
vi.mock("../src/lib/job-queue", () => ({}));
vi.mock("../src/lib/error-reporter", () => ({}));
vi.mock("../src/lib/tenant-quotas", () => ({}));
vi.mock("../src/lib/ai-audit", () => ({}));
vi.mock("../src/lib/ai-usage", () => ({}));
vi.mock("../src/lib/spend-guards", () => ({
  recordDailySpend: h.daily,
  evaluateSpend: h.evaluate,
  clearBudgetCache: h.clear,
}));
import { extendCommittedPlatformCostReservation } from "../src/middleware/audit-middleware";
const reservation = { auditId: 1n, userId: "tenant", costUsd: 1, adopted: false };
beforeEach(() => {
  h.row = {
    costUsd: "1",
    metadata: { accounting_state: "committed", surface: "openai_sip", reserve_window_usd: 1 },
  };
  h.tail = Promise.resolve();
  h.failWrite = false;
  vi.clearAllMocks();
  h.evaluate.mockResolvedValue(undefined);
});
describe("rolling admitted SIP cost estimate", () => {
  it("keeps initial admission at one window and accounts only elapsed additional windows", async () => {
    await extendCommittedPlatformCostReservation(reservation, 299);
    expect(h.row.costUsd).toBe("1");
    await extendCommittedPlatformCostReservation(reservation, 301);
    expect(h.row.costUsd).toBe("2");
    await extendCommittedPlatformCostReservation(reservation, 3600);
    expect(h.row.costUsd).toBe("12");
    expect(h.daily.mock.calls.reduce((total, [delta]) => total + delta, 0)).toBe(11);
    expect(h.row.metadata.cost_basis).toBe("realtime_duration_estimate");
  });
  it("is monotonic and idempotent when heartbeats and final replay overlap", async () => {
    await Promise.all([
      extendCommittedPlatformCostReservation(reservation, 1801),
      extendCommittedPlatformCostReservation(reservation, 301),
      extendCommittedPlatformCostReservation(reservation, 1801),
    ]);
    expect(h.row.costUsd).toBe("7");
    expect(h.daily).toHaveBeenCalledOnce();
    expect(h.daily).toHaveBeenCalledWith(6);
  });
  it.each(["reserved_before_provider", "provider_outcome_ambiguous"])(
    "recovers initial %s commit metadata after authoritative admission",
    async (state) => {
      h.row.metadata.accounting_state = state;
      h.failWrite = true;
      await expect(extendCommittedPlatformCostReservation(reservation, 301)).rejects.toThrow(
        "temporary database",
      );
      expect(h.row.costUsd).toBe("1");
      await extendCommittedPlatformCostReservation(reservation, 301);
      expect(h.row.metadata.accounting_state).toBe("committed");
      expect(h.row.costUsd).toBe("2");
      expect(h.daily).toHaveBeenCalledWith(2);
    },
  );
  it("does not reinterpret another surface or an unknown receipt as an admitted SIP call", async () => {
    h.row.metadata.surface = "browser";
    await expect(extendCommittedPlatformCostReservation(reservation, 301)).rejects.toThrow(
      "Admitted",
    );
    h.row.metadata.surface = "openai_sip";
    h.row.metadata.accounting_state = "unknown";
    await expect(extendCommittedPlatformCostReservation(reservation, 301)).rejects.toThrow(
      "Admitted",
    );
    expect(h.row.costUsd).toBe("1");
  });
  it("retains an earlier larger estimate when completion arrives late or out of order", async () => {
    h.row.costUsd = "12";
    await extendCommittedPlatformCostReservation(reservation, 301);
    expect(h.row.costUsd).toBe("12");
    expect(h.daily).not.toHaveBeenCalled();
  });
});
