import { describe, expect, it, beforeEach } from "vitest";
import {
  getDailySpendUsd,
  recordDailySpendUsd,
  resetDailySpendMemStateForTests,
  estimateMemWindowResetMs,
  getDailySpendWindowReset,
} from "./daily-spend-accumulator";

describe("daily-spend-accumulator (in-memory fallback)", () => {
  beforeEach(() => {
    resetDailySpendMemStateForTests();
  });

  it("starts at zero", async () => {
    expect(await getDailySpendUsd()).toBe(0);
  });

  it("accumulates recorded spend", async () => {
    await recordDailySpendUsd(1.25);
    await recordDailySpendUsd(0.75);
    expect(await getDailySpendUsd()).toBeCloseTo(2, 5);
  });

  it("ignores non-positive amounts", async () => {
    await recordDailySpendUsd(0);
    await recordDailySpendUsd(-1);
    expect(await getDailySpendUsd()).toBe(0);
  });

  it("estimateMemWindowResetMs is non-negative", () => {
    expect(estimateMemWindowResetMs()).toBeGreaterThanOrEqual(0);
  });

  it("getDailySpendWindowReset uses memory backend without Redis", async () => {
    const { resetMs, backend } = await getDailySpendWindowReset();
    expect(backend).toBe("memory");
    expect(resetMs).toBeGreaterThan(0);
    expect(resetMs).toBeLessThanOrEqual(24 * 60 * 60_000);
  });
});
