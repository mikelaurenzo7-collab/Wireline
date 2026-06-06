import { describe, expect, it } from "vitest";
import {
  buildStitchGenerationPrompt,
  resolveStitchMediaOperation,
  WIRELINE_STITCH_DESIGN_BRIEF,
  wantsStitchMediaRequest,
} from "./director-stitch-intent";

describe("director stitch intent", () => {
  it("routes website and hero media to Stitch", () => {
    expect(wantsStitchMediaRequest("Design a one-page website for a local HVAC company")).toBe(
      true,
    );
    expect(wantsStitchMediaRequest("Generate a hero image for our homepage")).toBe(true);
    expect(wantsStitchMediaRequest("Generate 3 logo concepts for my brand")).toBe(false);
  });

  it("routes named app screens (e.g. Vault) to Stitch", () => {
    expect(
      wantsStitchMediaRequest(
        "Design the Vault screen for Wireline Aurora Cream mobile app — agent outputs library",
      ),
    ).toBe(true);
  });

  it("appends Aurora Cream brief to Stitch generation prompts", () => {
    const prompt = buildStitchGenerationPrompt("Design a landing page hero", "Acme Plumbing");
    expect(prompt).toContain("Acme Plumbing");
    expect(prompt).toContain(WIRELINE_STITCH_DESIGN_BRIEF);
    expect(prompt).toContain("semantic HTML");
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
