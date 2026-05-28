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

let mockBudgetRows: any[] = [];
let mockAuditLogRows: any[] = [];

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
          return Promise.resolve(onFulfilled ? onFulfilled(mockAuditLogRows) : mockAuditLogRows);
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
  },
}));

describe("Spend Guards & Budgets", () => {
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    mockBudgetRows = [];
    mockAuditLogRows = [];
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
      mockAuditLogRows = [{ costUsd: "25.50" }, { costUsd: "15.25" }];

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
      mockAuditLogRows = [{ costUsd: "75.00" }]; // Already at $75

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
      mockAuditLogRows = [{ costUsd: "95.00" }];

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
      mockAuditLogRows = [{ costUsd: "85.00" }];

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
      mockAuditLogRows = [{ costUsd: "45.00" }];

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
      mockAuditLogRows = [{ costUsd: "105.00" }];

      const req = { user: { id: userId } };
      const res = {};
      const next = vi.fn();

      await enforceSpendCap(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("returns 402 payment required and blocks request if hardCap is breached", async () => {
      mockBudgetRows = [
        {
          monthlyLimitUsd: "100.00",
          hardCap: true,
          warnThresholdPct: 80,
          enabled: true,
        },
      ];
      mockAuditLogRows = [{ costUsd: "105.00" }];

      const req = { user: { id: userId } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await enforceSpendCap(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "SPEND_LIMIT_EXCEEDED",
          monthly_limit_usd: 100,
        }),
      );
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

  describe("enforce24hSpendCap system-wide cap", () => {
    it("blocks request once daily spend threshold is breached", () => {
      // Set some daily spend
      recordDailySpend(500.0); // Breach DAILY_SPEND_LIMIT_USD (which is 1% of CLAUDE_MONTHLY_BUDGET_USD)

      const req = {};
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      enforce24hSpendCap(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "DAILY_SPEND_LIMIT_EXCEEDED",
        }),
      );
    });
  });
});
