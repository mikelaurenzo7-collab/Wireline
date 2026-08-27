import { describe, expect, it } from "vitest";
import {
  normalizeResponsesUsage,
  normalizeUsageTokenCount,
  POSTGRES_INT32_MAX,
  saturatingUsageTokenSum,
} from "../src/lib/ai-usage";

describe("Responses usage accounting", () => {
  it("splits cache reads and writes out of reported input tokens", () => {
    expect(
      normalizeResponsesUsage({
        input_tokens: 10_000,
        input_tokens_details: {
          cached_tokens: 4_000,
          cache_write_tokens: 1_000,
        },
        output_tokens: 750,
      }),
    ).toEqual({
      inputTokens: 5_000,
      outputTokens: 750,
      cacheReadTokens: 4_000,
      cacheWriteTokens: 1_000,
    });
  });

  it("clamps malformed provider detail counts instead of producing negative input", () => {
    expect(
      normalizeResponsesUsage({
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 90, cache_write_tokens: 90 },
        output_tokens: -1,
      }),
    ).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 90,
      cacheWriteTokens: 10,
    });
  });

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
    [-1, 0],
    [12.9, 12],
    [Number.MAX_VALUE, POSTGRES_INT32_MAX],
    [2_147_483_648, POSTGRES_INT32_MAX],
    ["2147483648", POSTGRES_INT32_MAX],
    ["999999999999999999999999999999999999", POSTGRES_INT32_MAX],
    ["42", 42],
    ["1e3", 0],
    ["Infinity", 0],
    ["0x10", 0],
  ] as const)("normalizes provider token count %s to %s", (raw, expected) => {
    expect(normalizeUsageTokenCount(raw)).toBe(expected);
  });

  it("keeps every malformed Responses bucket finite, nonnegative, and safe", () => {
    const normalized = normalizeResponsesUsage({
      input_tokens: Number.POSITIVE_INFINITY,
      input_tokens_details: {
        cached_tokens: Number.NaN,
        cache_write_tokens: Number.MAX_VALUE,
      },
      output_tokens: Number.MAX_VALUE,
    });

    expect(normalized).toEqual({
      inputTokens: 0,
      outputTokens: POSTGRES_INT32_MAX,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    for (const count of Object.values(normalized)) {
      expect(Number.isSafeInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  it("saturates multi-record token addition at the PostgreSQL integer ceiling", () => {
    expect(saturatingUsageTokenSum(2_000_000_000, 200_000_000)).toBe(POSTGRES_INT32_MAX);
    expect(saturatingUsageTokenSum("2147483646", 1)).toBe(POSTGRES_INT32_MAX);
    expect(saturatingUsageTokenSum(1_000, 2_000, 3_000)).toBe(6_000);
  });

  it("floors fractional counts and clamps cache buckets to reported input", () => {
    expect(
      normalizeResponsesUsage({
        input_tokens: 100.9,
        input_tokens_details: { cached_tokens: 80.8, cache_write_tokens: 50.7 },
        output_tokens: 2.9,
      }),
    ).toEqual({
      inputTokens: 0,
      outputTokens: 2,
      cacheReadTokens: 80,
      cacheWriteTokens: 20,
    });
  });
});
