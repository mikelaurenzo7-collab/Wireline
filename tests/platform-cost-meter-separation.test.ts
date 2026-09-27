import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reads: [] as unknown[][],
  inserts: [] as Record<string, unknown>[],
  failInsert: false,
  daily: vi.fn(),
  evaluate: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => {
  const db = {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        for: () => chain,
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(h.reads.shift() ?? []).then(resolve),
      };
      return chain;
    },
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          if (h.failInsert) throw new Error("database unavailable");
          h.inserts.push(value);
          return [{ id: BigInt(h.inserts.length) }];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 1n }] }) }) }),
    transaction: async (perform: (tx: unknown) => Promise<unknown>) => perform(db),
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

import {
  commitPlatformCostReservation,
  reservePlatformCostRecord,
} from "../src/middleware/audit-middleware";

const budget = { monthlyLimitUsd: "1.50", hardCap: true, enabled: true };
const input = (surface: string) => ({
  userId: "tenant",
  action: "voice.realtime.session",
  provider: "openai",
  model: "gpt-realtime",
  costUsd: 1,
  requestMeta: { surface },
});
beforeEach(() => {
  h.reads = [];
  h.inserts = [];
  h.failInsert = false;
  vi.clearAllMocks();
  h.evaluate.mockResolvedValue(undefined);
});

describe("separate voice funding and managed AI admission", () => {
  it("retains durable provider receipts for consecutive phone calls even at the Starter AI cap", async () => {
    for (const call of [1, 2]) {
      h.reads.push([budget], [], [{ costUsd: "1.50" }]);
      const result = await reservePlatformCostRecord({
        ...input("openai_sip"),
        idempotencyKey: `openai-sip:call-${call}`,
      });
      expect(result.reserved).toBe(true);
      if (!result.reserved) throw new Error("expected a durable reservation");
      expect(result.reservation).toMatchObject({ meter: "live_voice", costUsd: 1, adopted: false });
      await commitPlatformCostReservation(result.reservation);
    }
    expect(h.inserts).toHaveLength(2);
    expect(h.inserts.map((row) => row.costUsd)).toEqual(["1", "1"]);
    expect(h.daily).toHaveBeenCalledTimes(2);
    expect(h.evaluate).not.toHaveBeenCalled();
  });

  it.each(["studio_simulation", "live_voice_session"])(
    "still caps a second $1 private voice session (%s)",
    async (surface) => {
      h.reads.push([budget], [{ costUsd: "0" }]);
      const first = await reservePlatformCostRecord(input(surface));
      expect(first.reserved).toBe(true);
      if (!first.reserved) throw new Error("expected first private session");
      await commitPlatformCostReservation(first.reservation);
      expect(h.evaluate).toHaveBeenCalledWith("tenant", 1);
      h.reads.push([budget], [{ costUsd: "1" }]);
      await expect(reservePlatformCostRecord(input(surface))).resolves.toMatchObject({
        reserved: false,
        reason: "cap_reached",
        monthToDateUsd: 1,
        monthlyLimitUsd: 1.5,
      });
      expect(h.inserts).toHaveLength(1);
    },
  );

  it("recovers the persisted meter when adopting an existing receipt", async () => {
    h.reads.push(
      [budget],
      [
        {
          id: 9n,
          action: "voice.realtime.session",
          provider: "openai",
          metadata: { surface: "openai_sip" },
          costUsd: "2",
        },
      ],
    );
    await expect(
      reservePlatformCostRecord({ ...input("openai_sip"), idempotencyKey: "openai-sip:call-1" }),
    ).resolves.toMatchObject({
      reserved: true,
      reservation: { auditId: 9n, adopted: true, costUsd: 2, meter: "live_voice" },
    });
    expect(h.inserts).toHaveLength(0);
  });

  it.each(["missing budget", "failed insert"])("refuses phone work with %s", async (failure) => {
    h.reads.push(failure === "missing budget" ? [] : [budget], [{ costUsd: "0" }]);
    h.failInsert = failure === "failed insert";
    await expect(reservePlatformCostRecord(input("openai_sip"))).resolves.toEqual({
      reserved: false,
      reason: "unavailable",
    });
    expect(h.daily).not.toHaveBeenCalled();
  });

  it("does not let an invalid AI cap redefine separate voice coverage", async () => {
    h.reads.push([{ ...budget, monthlyLimitUsd: "0" }], [{ costUsd: "0" }]);
    await expect(reservePlatformCostRecord(input("openai_sip"))).resolves.toMatchObject({
      reserved: true,
    });
    h.reads.push([{ ...budget, monthlyLimitUsd: "0" }]);
    await expect(reservePlatformCostRecord(input("studio_simulation"))).resolves.toEqual({
      reserved: false,
      reason: "unavailable",
    });
  });
});
