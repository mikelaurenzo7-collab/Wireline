import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { getCachedNavCounts, setCachedNavCounts } from "./nav-counts-cache";
import { touchNavCounts } from "./nav-counts-invalidate";

describe("touchNavCounts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setCachedNavCounts("user-1", { "/triage": 3, "/inbox": 1, "/outbound": 0, "/live": 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates cached nav counts for the tenant", () => {
    expect(getCachedNavCounts("user-1")).not.toBeNull();
    touchNavCounts("user-1");
    expect(getCachedNavCounts("user-1")).toBeNull();
  });

  it("no-ops on empty user id", () => {
    touchNavCounts("");
    expect(getCachedNavCounts("user-1")).not.toBeNull();
  });
});
