import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  getCachedNavCounts,
  setCachedNavCounts,
  invalidateNavCounts,
  NAV_COUNTS_TTL_MS,
} from "./nav-counts-cache";

describe("nav-counts-cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateNavCounts("user-1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null on miss", () => {
    expect(getCachedNavCounts("user-1")).toBeNull();
  });

  it("returns cached counts before TTL expires", () => {
    const counts = { "/triage": 2, "/inbox": 1, "/outbound": 0, "/live": 0 };
    setCachedNavCounts("user-1", counts);
    expect(getCachedNavCounts("user-1")).toEqual(counts);
  });

  it("expires entries after TTL", () => {
    setCachedNavCounts("user-1", { "/triage": 1, "/inbox": 0, "/outbound": 0, "/live": 0 });
    vi.advanceTimersByTime(NAV_COUNTS_TTL_MS + 1);
    expect(getCachedNavCounts("user-1")).toBeNull();
  });

  it("invalidateNavCounts clears one user", () => {
    setCachedNavCounts("user-1", { "/triage": 5, "/inbox": 0, "/outbound": 0, "/live": 0 });
    invalidateNavCounts("user-1");
    expect(getCachedNavCounts("user-1")).toBeNull();
  });
});
