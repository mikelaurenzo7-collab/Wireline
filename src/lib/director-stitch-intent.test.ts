import { describe, expect, it } from "vitest";
import { resolveStitchMediaOperation, wantsStitchMediaRequest } from "./director-stitch-intent";

describe("director stitch intent", () => {
  it("routes website and hero media to Stitch", () => {
    expect(wantsStitchMediaRequest("Design a one-page website for a local HVAC company")).toBe(
      true,
    );
    expect(wantsStitchMediaRequest("Generate a hero image for our homepage")).toBe(true);
    expect(wantsStitchMediaRequest("Generate 3 logo concepts for my brand")).toBe(false);
  });

  it("detects edit and variants when a stitch session exists", () => {
    const session = { projectId: "123", screenId: "456" };
    expect(resolveStitchMediaOperation("Make the hero darker", session)).toBe("edit");
    expect(resolveStitchMediaOperation("Show 3 color variants", session)).toBe("variants");
    expect(resolveStitchMediaOperation("Build the full multi-page site", session)).toBe(
      "build_site",
    );
  });
});
