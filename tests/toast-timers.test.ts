import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastTimers } from "../src/lib/toast-timers";

describe("notification reading time", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resumes only the unread time after hover, even after a long pause", () => {
    const expired = vi.fn();
    const timers = createToastTimers(expired);
    timers.schedule("notice", 4500);
    vi.advanceTimersByTime(1200);
    timers.pause("notice", "pointer");
    vi.advanceTimersByTime(60_000);
    expect(expired).not.toHaveBeenCalled();

    timers.resume("notice", "pointer");
    vi.advanceTimersByTime(3299);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledExactlyOnceWith("notice");
  });

  it("keeps a keyboard-focused notification open after the pointer leaves", () => {
    const expired = vi.fn();
    const timers = createToastTimers(expired);
    timers.schedule("notice", 4500);
    vi.advanceTimersByTime(1000);
    timers.pause("notice", "pointer");
    timers.pause("notice", "focus");
    timers.pause("notice", "focus");
    timers.resume("notice", "pointer");
    vi.advanceTimersByTime(60_000);
    expect(expired).not.toHaveBeenCalled();

    timers.resume("notice", "focus");
    timers.resume("notice", "focus");
    vi.advanceTimersByTime(3499);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledExactlyOnceWith("notice");
  });

  it("keeps hovering paused when focus moves away", () => {
    const expired = vi.fn();
    const timers = createToastTimers(expired);
    timers.schedule("notice", 1000);
    timers.pause("notice", "focus");
    timers.pause("notice", "pointer");
    timers.resume("notice", "focus");
    vi.advanceTimersByTime(5000);
    expect(expired).not.toHaveBeenCalled();
    timers.resume("notice", "pointer");
    vi.advanceTimersByTime(1000);
    expect(expired).toHaveBeenCalledExactlyOnceWith("notice");
  });

  it("refreshes duplicate reading time without dismissing a focused notification", () => {
    const expired = vi.fn();
    const timers = createToastTimers(expired);
    timers.schedule("notice", 4500);
    vi.advanceTimersByTime(4000);
    timers.pause("notice", "focus");
    timers.schedule("notice", 6000);
    vi.advanceTimersByTime(60_000);
    expect(expired).not.toHaveBeenCalled();
    timers.resume("notice", "focus");
    vi.advanceTimersByTime(5999);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledExactlyOnceWith("notice");
  });

  it("does not dismiss persistent notifications when hover or focus ends", () => {
    const expired = vi.fn();
    const timers = createToastTimers(expired);
    timers.schedule("notice", 0);
    timers.pause("notice", "pointer");
    timers.pause("notice", "focus");
    timers.resume("notice", "pointer");
    timers.resume("notice", "focus");
    vi.advanceTimersByTime(60_000);
    expect(expired).not.toHaveBeenCalled();
  });

  it("does not revive dismissed or evicted notifications when a late leave event arrives", () => {
    const expired = vi.fn();
    const timers = createToastTimers(expired);
    timers.schedule("dismissed", 1000);
    timers.pause("dismissed", "pointer");
    timers.schedule("evicted", 1000);
    timers.clear("dismissed");
    timers.clear("evicted");
    timers.resume("dismissed", "pointer");
    vi.advanceTimersByTime(5000);
    expect(expired).not.toHaveBeenCalled();
  });

  it("cleans up pending callbacks on teardown and leaves other notifications independent", () => {
    const expired = vi.fn();
    const timers = createToastTimers(expired);
    timers.schedule("reading", 1000);
    timers.schedule("finished", 1000);
    timers.pause("reading", "focus");
    vi.advanceTimersByTime(1000);
    expect(expired).toHaveBeenCalledExactlyOnceWith("finished");
    timers.schedule("pending", 1000);
    timers.clearAll();
    timers.resume("reading", "focus");
    vi.advanceTimersByTime(5000);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
