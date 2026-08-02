import { describe, expect, it } from "vitest";
import { computeAuditSummary } from "../src/lib/audit-summary";

describe("audit summary cache economics", () => {
  it("reports read savings net of GPT-5.6 cache-write premiums", () => {
    const summary = computeAuditSummary({
      windowDays: 7,
      rows: [
        {
          model: "openai/gpt-5.6-terra",
          inputTokens: 100_000,
          cacheReadTokens: 100_000,
          cacheCreateTokens: 100_000,
          outputTokens: 10_000,
          costUsd: 1.12,
        },
      ],
    });

    // Long context rates: read saves (4 - .4) * .1 = $0.36 while the write
    // premium costs (5 - 4) * .1 = $0.10, for $0.26 net savings.
    expect(summary.totals.cache_savings_usd).toBe(0.26);
  });
});
