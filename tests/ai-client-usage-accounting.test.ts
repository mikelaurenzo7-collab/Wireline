import { describe, expect, it } from "vitest";
import { normalizeResponsesUsage } from "../src/lib/ai-usage";

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
});
