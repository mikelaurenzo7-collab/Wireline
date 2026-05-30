import { describe, expect, it } from "vitest";
import { CHANNELS_HUB, TRAINING_HUB } from "./HubTabs";

describe("Hub tab definitions", () => {
  it("TRAINING_HUB links Chat and Training (not stale /knowledge)", () => {
    expect(TRAINING_HUB.map((t) => t.path)).toEqual(["/chat", "/training"]);
    expect(TRAINING_HUB.map((t) => t.label)).toEqual(["Chat", "Training"]);
  });

  it("CHANNELS_HUB covers Phone, Email, SMS", () => {
    expect(CHANNELS_HUB.map((t) => t.path)).toEqual(["/phone", "/email", "/sms"]);
  });

  it("hub paths are unique", () => {
    const paths = [...TRAINING_HUB, ...CHANNELS_HUB].map((t) => t.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
