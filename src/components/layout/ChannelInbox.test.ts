import { describe, expect, it } from "vitest";
import { resolveChannelListNavigationIndex } from "./ChannelInbox";

describe("resolveChannelListNavigationIndex", () => {
  it("wraps channel-thread navigation with arrow keys", () => {
    expect(resolveChannelListNavigationIndex(0, "ArrowDown", 3)).toBe(1);
    expect(resolveChannelListNavigationIndex(0, "ArrowUp", 3)).toBe(2);
  });

  it("supports Home and End for listbox navigation", () => {
    expect(resolveChannelListNavigationIndex(1, "Home", 3)).toBe(0);
    expect(resolveChannelListNavigationIndex(1, "End", 3)).toBe(2);
    expect(resolveChannelListNavigationIndex(1, "Enter", 3)).toBeNull();
  });
});
