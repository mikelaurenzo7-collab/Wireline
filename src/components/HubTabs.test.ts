import { describe, expect, it } from "vitest";
import { CHANNELS_HUB, TRAINING_HUB } from "./HubTabs";

describe("Hub tab definitions", () => {
  it("TRAINING_HUB still exports Chat and Training paths for internal use", () => {
    expect(TRAINING_HUB.map((t) => t.path)).toEqual(["/chat", "/training"]);
  });

  it("CHANNELS_HUB covers Phone, Email, SMS (sidebar targets; not mounted on channel pages)", () => {
    expect(CHANNELS_HUB.map((t) => t.path)).toEqual(["/phone", "/email", "/sms"]);
  });

  it("hub paths are unique", () => {
    const paths = [...TRAINING_HUB, ...CHANNELS_HUB].map((t) => t.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
