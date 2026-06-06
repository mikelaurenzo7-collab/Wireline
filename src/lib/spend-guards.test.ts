import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  clearBudgetCache,
  getBudgetSnapshot,
  evaluateSpend,
  enforceSpendCap,
  recordDailySpend,
  enforce24hSpendCap,
} from "./spend-guards";
import { drizzle } from "./server-context";
import { dispatchWebhook } from "./webhook-helpers";
import { SentryEvents } from "./sentry-events";
import { recordDailySpendUsd, resetDailySpendMemStateForTests } from "./daily-spend-accumulator";

let mockBudgetRows: any[] = [];
let mockMtdRow: { mtdCost: string }[] = [{ mtdCost: "0" }];

vi.mock("./daily-spend-accumulator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./daily-spend-accumulator")>();
  return {
    ...actual,
    recordDailySpendUsd: vi.fn(actual.recordDailySpendUsd),
    getDailySpendUsd: vi.fn(actual.getDailySpendUsd),
  };
});

// Mock server context (Drizzle, logger)
vi.mock("./server-context", () => {
  const mockDrizzle = {
    select: vi.fn().mockImplementation(() => {
      const chain: any = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((onFulfilled) => {
          if (chain.limit.mock.calls.length > 0) {
            return Promise.resolve(onFulfilled(mockBudgetRows));
          }
          return Promise.resolve(onFulfilled ? onFulfilled(mockMtdRow) : mockMtdRow);
        }),
      };
      return chain;
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockResolvedValue({}),
    })),
  };

  return {
    drizzle: mockDrizzle,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

// Mock webhook dispatcher
vi.mock("./webhook-helpers", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

// Mock sentry events
vi.mock("./sentry-events", () => ({
  SentryEvents: {
    budgetExceeded: vi.fn(),
    spendGuardDegraded: vi.fn(),
  },
}));

describe("Spend Guards & Budgets", () => {
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    mockBudgetRows = [];
    mockMtdRow = [{ mtdCost: "0" }];
    resetDailySpendMemStateForTests();
    clearBudgetCache(userId);
  });

  describe("getBudgetSnapshot", () => {
    it("returns null budget and 0 cost when no DB entries exist", async () => {
      const snap = await getBudgetSnapshot(userId);
      expect(snap.budget).toBeNull();
      expect(snap.mtdCost).toBe(0);
    });

    it("fetches, maps, and returns budget row and MTD cost", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 75,
          enabled: true,
        },
      ];
      mockMtdRow = [{ mtdCost: "40.75" }];

      const snap = await getBudgetSnapshot(userId);
      expect(snap.budget).toEqual({
        monthly_limit_usd: 100,
        hard_cap: true,
        warn_threshold_pct: 75,
        enabled: true,
      });
      expect(snap.mtdCost).toBe(40.75);
    });

    it("utilizes cache on subsequent calls unless bypassed", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 75,
          enabled: true,
        },
      ];
      const _snap1 = await getBudgetSnapshot(userId);

      // Change DB return value
      mockBudgetRows = [
        {
          monthlyLimitUsd: "200.00",
          hardCap: false,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];

      const snap2 = await getBudgetSnapshot(userId);
      expect(snap2.budget?.monthly_limit_usd).toBe(100); // Cached value

      const snap3 = await getBudgetSnapshot(userId, true);
      expect(snap3.budget?.monthly_limit_usd).toBe(200); // Bypassed cache
    });
  });

  describe("evaluateSpend", () => {
    it("does nothing if budget is disabled or limits are <= 0", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "0.00",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      await evaluateSpend(userId, 5.0);
      expect(dispatchWebhook).not.toHaveBeenCalled();
    });

    it("fires spend.warning webhook when crossing warn threshold", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      mockMtdRow = [{ mtdCost: "75.00" }]; // Already at $75

      // Populate budgetCache first so bumpBudgetCache has a target
      await getBudgetSnapshot(userId);

      // Evaluate spending another $6.00 (Total MTD = $81.00, which is > 80%)
      await evaluateSpend(userId, 6.0);

      expect(drizzle.insert).toHaveBeenCalled();
      expect(dispatchWebhook).toHaveBeenCalledWith(
        userId,
        "spend.warning",
        expect.objectContaining({
          month_to_date_usd: 81,
          monthly_limit_usd: 100,
          threshold_pct: 80,
        }),
      );
      expect(SentryEvents.budgetExceeded).not.toHaveBeenCalled();
    });

    it("fires spend.exceeded webhook and calls Sentry when crossing 100%", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      mockMtdRow = [{ mtdCost: "95.00" }];

      // Populate budgetCache first so bumpBudgetCache has a target
      await getBudgetSnapshot(userId);

      await evaluateSpend(userId, 6.0); // Total MTD = $101.00 (> 100%)

      // Should dispatch warnings & exceeded
      expect(dispatchWebhook).toHaveBeenCalledWith(
        userId,
        "spend.exceeded",
        expect.objectContaining({
          month_to_date_usd: 101,
          monthly_limit_usd: 100,
          threshold_pct: 100,
        }),
      );
      expect(SentryEvents.budgetExceeded).toHaveBeenCalledWith({
        user_id: userId,
        spent: 101,
        budget: 100,
      });
    });

    it("debounces webhooks: skips dispatching if spendAlert insert fails (already alerted)", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      mockMtdRow = [{ mtdCost: "85.00" }];

      // Populate budgetCache first so bumpBudgetCache has a target
      await getBudgetSnapshot(userId);

      // Make Drizzle insert fail (simulating unique key violation/already alerted)
      vi.mocked(drizzle.insert).mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error("Unique constraint violation")),
      } as any);

      await evaluateSpend(userId, 5.0);
      expect(dispatchWebhook).not.toHaveBeenCalled();
    });
  });

  describe("enforceSpendCap middleware", () => {
    it("passes request through if user is not present on request", async () => {
      const req = {};
      const res = {};
      const next = vi.fn();

      await enforceSpendCap(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("passes request through if monthly cost is below budget", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      mockMtdRow = [{ mtdCost: "45.00" }];

      const req = { user: { id: userId } };
      const res = {};
      const next = vi.fn();

      await enforceSpendCap(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("passes request through if monthly limit exceeded but hardCap is false", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: false,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      mockMtdRow = [{ mtdCost: "105.00" }];

      const req = { user: { id: userId } };
      const res = {};
      const next = vi.fn();

      await enforceSpendCap(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("passes through when monthly limit exceeded even if hardCap is true (overage billing)", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      mockMtdRow = [{ mtdCost: "105.00" }];

      const req = { user: { id: userId } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await enforceSpendCap(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("fails open and passes request through if database query errors", async () => {
      vi.mocked(drizzle.select).mockImplementation(() => {
        throw new Error("Supabase connection timed out");
      });

      const req = { user: { id: userId } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await enforceSpendCap(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("enforce24hSpendCap (telemetry only)", () => {
    it("always passes through regardless of accumulated daily spend", async () => {
      await recordDailySpendUsd(500.0);

      const req = {};
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await enforce24hSpendCap(req as any, res as any, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("recordDailySpend delegates to Redis-backed accumulator", async () => {
      recordDailySpend(1.25);
      await vi.waitFor(() => {
        expect(recordDailySpendUsd).toHaveBeenCalledWith(1.25);
      });
    });
  });
});
