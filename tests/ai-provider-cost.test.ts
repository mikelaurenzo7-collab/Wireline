import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertedRows: [] as Array<Record<string, unknown>>,
  values: vi.fn(async (rows: Array<Record<string, unknown>>) => {
    mocks.insertedRows = rows;
  }),
  quotaIncrement: vi.fn(async () => ({ allowed: true, limit: 10_000, used: 1_100 })),
  recordDailySpend: vi.fn(),
  evaluateSpend: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    insert: vi.fn(() => ({ values: mocks.values })),
  },
  log: { error: vi.fn(), warn: vi.fn() },
  quotaTracker: { checkAndIncrement: mocks.quotaIncrement },
}));

vi.mock("../src/lib/spend-guards", () => ({
  clearBudgetCache: vi.fn(),
  recordDailySpend: mocks.recordDailySpend,
  evaluateSpend: mocks.evaluateSpend,
}));

vi.mock("../src/lib/background-work", () => ({
  runInBackground: vi.fn(),
}));

import { resolveRuntimeCallCost, type RuntimeCallMeta } from "../src/lib/ai-audit";
import {
  normalizeProviderReportedCostUsd,
  PROVIDER_COST_USD_MAX,
} from "../src/lib/ai-provider-cost";
import { POSTGRES_INT32_MAX } from "../src/lib/ai-usage";
import { persistRuntimeAuditRecords } from "../src/middleware/audit-middleware";

function recordWithCost(actualCost: unknown): RuntimeCallMeta {
  return {
    model: "openai/gpt-5.6-terra",
    provider: "gateway",
    actual_cost_usd: actualCost as number,
    input_tokens: 1_000,
    output_tokens: 100,
    cache_read_tokens: 0,
    cache_create_tokens: 0,
    latency_ms: 25,
  };
}

beforeEach(() => {
  mocks.insertedRows = [];
  vi.clearAllMocks();
});

describe("provider-reported AI cost normalization", () => {
  it.each([
    ["0", 0],
    ["0.0042", 0.0042],
    ["0.1234564", 0.123456],
    ["0.1234565", 0.123457],
    ["999999.9999994", PROVIDER_COST_USD_MAX],
  ] as const)("accepts and numeric(12,6)-quantizes %s", (raw, expected) => {
    expect(normalizeProviderReportedCostUsd(raw)).toBe(expected);
  });

  it.each([
    "0x10",
    "1e308",
    1e308,
    "-0.01",
    -0.01,
    "NaN",
    Number.NaN,
    "Infinity",
    Number.POSITIVE_INFINITY,
    " 0.01 ",
    "00.01",
    "999999.9999995",
    "1000000",
  ])("rejects non-canonical or ledger-unsafe value %s", (raw) => {
    expect(normalizeProviderReportedCostUsd(raw)).toBeUndefined();
  });

  it.each([
    ["hex", "0x10"],
    ["huge", "1e308"],
    ["negative", -0.01],
    ["NaN-ish", "NaN"],
  ] as const)(
    "falls back to catalog cost and continues audit evaluation for %s",
    async (_label, raw) => {
      const record = recordWithCost(raw);

      expect(resolveRuntimeCallCost(record)).toEqual({
        costUsd: 0.0032,
        costBasis: "catalog_estimate",
      });
      await expect(
        persistRuntimeAuditRecords({
          userId: "user-1",
          action: "test.ai",
          records: [record],
        }),
      ).resolves.toBeUndefined();

      expect(mocks.insertedRows).toEqual([
        expect.objectContaining({
          costUsd: "0.0032",
          metadata: { cost_basis: "catalog_estimate" },
        }),
      ]);
      expect(mocks.recordDailySpend).toHaveBeenCalledWith(0.0032);
      expect(mocks.evaluateSpend).toHaveBeenCalledWith("user-1", 0.0032);
    },
  );

  it("uses the same validated value for provider cost and cost_basis", async () => {
    const record = recordWithCost("0.1234567");

    expect(resolveRuntimeCallCost(record)).toEqual({
      costUsd: 0.123457,
      costBasis: "provider_reported",
    });
    await persistRuntimeAuditRecords({
      userId: "user-1",
      action: "test.ai",
      records: [record],
    });

    expect(mocks.insertedRows).toEqual([
      expect.objectContaining({
        costUsd: "0.123457",
        metadata: { cost_basis: "provider_reported" },
      }),
    ]);
    expect(mocks.evaluateSpend).toHaveBeenCalledWith("user-1", 0.123457);
  });

  it("saturates token and latency fields before the PostgreSQL audit insert", async () => {
    const record = {
      ...recordWithCost("0.01"),
      input_tokens: Number.MAX_VALUE,
      output_tokens: 2_147_483_648,
      cache_read_tokens: "999999999999999999999" as unknown as number,
      cache_create_tokens: Number.POSITIVE_INFINITY,
      latency_ms: Number.MAX_VALUE,
    };

    await persistRuntimeAuditRecords({
      userId: "user-1",
      action: "test.ai",
      records: [record],
    });

    expect(mocks.insertedRows).toEqual([
      expect.objectContaining({
        inputTokens: POSTGRES_INT32_MAX,
        outputTokens: POSTGRES_INT32_MAX,
        cacheReadTokens: POSTGRES_INT32_MAX,
        cacheCreateTokens: 0,
        latencyMs: POSTGRES_INT32_MAX,
        costUsd: "0.01",
      }),
    ]);
    expect(mocks.quotaIncrement).toHaveBeenCalledWith(
      "user-1",
      "claude_tokens_daily",
      POSTGRES_INT32_MAX,
    );
  });

  it("counts cache read and cache creation buckets against the daily token quota", async () => {
    await persistRuntimeAuditRecords({
      userId: "user-1",
      action: "test.ai.cache",
      records: [
        {
          ...recordWithCost("0.01"),
          input_tokens: 100,
          output_tokens: 20,
          cache_read_tokens: 300,
          cache_create_tokens: 40,
        },
      ],
    });

    expect(mocks.quotaIncrement).toHaveBeenCalledWith("user-1", "claude_tokens_daily", 460);
  });
});
