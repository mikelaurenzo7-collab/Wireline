import { describe, expect, it } from "vitest";

import {
  buildLiveVideoUsageSnapshot,
  estimatedLiveVideoFullUseMargin,
  LIVE_VIDEO_ADDON_PRICE_USD,
  LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
  LIVE_VIDEO_MAX_SESSION_SECONDS,
  LIVE_VIDEO_MIN_FULL_USE_MARGIN,
  LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD,
  LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
  liveVideoUsagePeriodKey,
} from "./live-video-policy";

describe("live video commercial policy", () => {
  it("keeps the founder add-on explicit and bounded to the Starter provider envelope", () => {
    expect(LIVE_VIDEO_ADDON_PRICE_USD).toBe(19);
    expect(LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY).toBe(60);
    expect(LIVE_VIDEO_SESSION_RESERVATION_MINUTES).toBe(5);
    expect(LIVE_VIDEO_MAX_SESSION_SECONDS).toBe(300);
    expect(LIVE_VIDEO_PROVIDER_COST_PER_MINUTE_USD).toBe(0.13);
  });

  it("builds a UTC-month usage snapshot and fails closed before a partial session", () => {
    expect(liveVideoUsagePeriodKey(new Date("2026-07-31T23:59:59.000Z"))).toBe("2026-07");
    expect(buildLiveVideoUsageSnapshot(55, "2026-07")).toMatchObject({
      usedMinutes: 55,
      remainingMinutes: 5,
      exhausted: false,
    });
    expect(buildLiveVideoUsageSnapshot(56, "2026-07")).toMatchObject({
      usedMinutes: 56,
      remainingMinutes: 4,
      exhausted: true,
    });
    expect(buildLiveVideoUsageSnapshot(-5, "2026-07").usedMinutes).toBe(0);
  });

  it("preserves at least a fifty-percent full-use margin after conservative provider reserve and commercial fees", () => {
    const margin = estimatedLiveVideoFullUseMargin();
    expect(margin).toBeGreaterThanOrEqual(LIVE_VIDEO_MIN_FULL_USE_MARGIN);
    expect(margin).toBeCloseTo(0.5327, 4);
  });
});
