import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStitchPollDelaysMs,
  getStitchFinalizePollDelaysMs,
  getStitchInRequestAssetPollDelaysMs,
  getStitchInRequestDeadlineMs,
  STITCH_FINALIZE_POLL_BUDGET_MS,
  STITCH_IN_REQUEST_ASSET_POLL_MS,
  STITCH_VERCEL_MAX_DURATION_MS,
} from "./google-stitch-config";

describe("buildStitchPollDelaysMs", () => {
  it("starts at zero and ends near the budget", () => {
    const delays = buildStitchPollDelaysMs(120_000);
    expect(delays[0]).toBe(0);
    expect(delays.at(-1)).toBeGreaterThanOrEqual(115_000);
    expect(delays.at(-1)).toBeLessThanOrEqual(125_000);
  });
});

describe("stitch poll budgets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("caps in-request deadline under Vercel maxDuration", () => {
    vi.stubEnv("GOOGLE_STITCH_TIMEOUT_MS", "540000");
    expect(getStitchInRequestDeadlineMs()).toBeLessThanOrEqual(STITCH_VERCEL_MAX_DURATION_MS);
    expect(getStitchInRequestDeadlineMs()).toBe(540_000);
  });

  it("uses short in-request asset poll and longer finalize poll", () => {
    const inRequest = getStitchInRequestAssetPollDelaysMs();
    const finalize = getStitchFinalizePollDelaysMs();
    expect(inRequest.at(-1)).toBeGreaterThanOrEqual(STITCH_IN_REQUEST_ASSET_POLL_MS - 10_000);
    expect(finalize.at(-1)).toBeGreaterThanOrEqual(STITCH_FINALIZE_POLL_BUDGET_MS - 10_000);
    expect(inRequest.at(-1)!).toBeLessThan(finalize.at(-1)!);
  });

  it("shrinks in-request poll when little wall time remains", () => {
    const tight = getStitchInRequestAssetPollDelaysMs(25_000);
    expect(tight.at(-1)).toBeLessThanOrEqual(30_000);
  });
});
