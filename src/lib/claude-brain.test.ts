// Cost estimation + audit context tests. The estimateCost function gates
// budget alerts and bills users; an off-by-one here is a real-money bug.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  estimateCost,
  isClaudeAvailable,
  withAuditCapture,
  createAuditContext,
  ClaudeUnavailableError,
} from "./claude-brain";

describe("estimateCost — Opus 4.x default rates", () => {
  it("returns 0 for empty usage", () => {
    expect(estimateCost({})).toBe(0);
  });

  it("computes input_tokens at $5/M", () => {
    // 1M input tokens * $5/M = $5
    expect(estimateCost({ input_tokens: 1_000_000 })).toBeCloseTo(5, 5);
  });

  it("computes output_tokens at $25/M", () => {
    expect(estimateCost({ output_tokens: 1_000_000 })).toBeCloseTo(25, 5);
  });

  it("computes cache reads at ~10% of input rate (Opus: $0.50/M)", () => {
    // 1M cache_read_input_tokens * (5 * 0.10) = $0.50
    expect(estimateCost({ cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.5, 5);
  });

  it("computes cache writes at 1.25x input rate (Opus: $6.25/M)", () => {
    expect(estimateCost({ cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(6.25, 5);
  });

  it("sums all components", () => {
    const cost = estimateCost({
      input_tokens: 100_000,
      output_tokens: 50_000,
      cache_read_input_tokens: 200_000,
      cache_creation_input_tokens: 10_000,
    });
    // 100k * $5/M + 50k * $25/M + 200k * $0.50/M + 10k * $6.25/M
    // = 0.5 + 1.25 + 0.1 + 0.0625 = 1.9125
    expect(cost).toBeCloseTo(1.9125, 4);
  });
});

describe("estimateCost — model-specific rates", () => {
  it("uses Sonnet rates ($3/M input, $15/M output) when model name contains 'sonnet'", () => {
    expect(estimateCost({ input_tokens: 1_000_000 }, "claude-sonnet-4-6")).toBeCloseTo(3, 5);
    expect(estimateCost({ output_tokens: 1_000_000 }, "claude-sonnet-4-6")).toBeCloseTo(15, 5);
  });

  it("uses Haiku rates ($1/M input, $5/M output) when model name contains 'haiku'", () => {
    expect(estimateCost({ input_tokens: 1_000_000 }, "claude-haiku-4-5")).toBeCloseTo(1, 5);
    expect(estimateCost({ output_tokens: 1_000_000 }, "claude-haiku-4-5")).toBeCloseTo(5, 5);
  });

  it("falls back to Opus rates for unrecognized model names", () => {
    expect(estimateCost({ input_tokens: 1_000_000 }, "future-model")).toBeCloseTo(5, 5);
  });
});

describe("isClaudeAvailable", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("returns true when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(isClaudeAvailable()).toBe(true);
  });

  it("returns false when ANTHROPIC_API_KEY is unset", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isClaudeAvailable()).toBe(false);
  });

  it("returns false on empty-string key", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(isClaudeAvailable()).toBe(false);
  });
});

describe("ClaudeUnavailableError", () => {
  it("has status 503 for HTTP error mapping", () => {
    const err = new ClaudeUnavailableError();
    expect(err.status).toBe(503);
    expect(err.name).toBe("ClaudeUnavailableError");
  });
});

describe("withAuditCapture", () => {
  it("returns the wrapped function's result and an empty records array when no calls happen", async () => {
    const { result, records } = await withAuditCapture(async () => "ok");
    expect(result).toBe("ok");
    expect(records).toEqual([]);
  });

  it("propagates exceptions thrown inside the captured function", async () => {
    await expect(
      withAuditCapture(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
  });
});

describe("createAuditContext", () => {
  it("returns a fresh, empty context", () => {
    const ctx = createAuditContext();
    expect(ctx).toEqual({ records: [] });
    // Mutations are isolated between contexts
    ctx.records.push({} as any);
    const ctx2 = createAuditContext();
    expect(ctx2.records).toEqual([]);
  });
});
