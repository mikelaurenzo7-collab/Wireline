import { describe, expect, it } from "vitest";
import { CHANNELS_HUB, resolveHubTabFocusIndex } from "./HubTabs";

// TRAINING_HUB removed in 2026-06 IA audit — Chat + Training consolidated into Studio.

describe("Hub tab definitions", () => {
  it("CHANNELS_HUB covers Phone, Email, SMS (sidebar targets; not mounted on channel pages)", () => {
    expect(CHANNELS_HUB.map((t) => t.path)).toEqual(["/phone", "/email", "/sms"]);
  });

  it("hub paths are unique", () => {
    const paths = [...CHANNELS_HUB].map((t) => t.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("supports arrow-key roving across hub tabs", () => {
    expect(resolveHubTabFocusIndex(0, "ArrowRight", 3)).toBe(1);
    expect(resolveHubTabFocusIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(resolveHubTabFocusIndex(1, "Home", 3)).toBe(0);
    expect(resolveHubTabFocusIndex(1, "End", 3)).toBe(2);
    expect(resolveHubTabFocusIndex(1, "Enter", 3)).toBeNull();
  });
});
