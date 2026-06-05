import { describe, expect, it } from "vitest";
import {
  buildDirectorDeliverableGuidance,
  wantsCodeDeliverable,
  wantsLogoCreativePath,
  wantsLongDeliverable,
  wantsWebsiteDeliverable,
} from "./director-deliverables";

describe("director deliverables", () => {
  it("detects website design without logo creative routing", () => {
    expect(wantsWebsiteDeliverable("Help me design a new website for my HVAC business")).toBe(true);
    expect(wantsLogoCreativePath("Help me design a new website for my HVAC business")).toBe(false);
  });

  it("routes explicit logo requests to creative path", () => {
    expect(wantsLogoCreativePath("Generate 3 logo concepts for my brand")).toBe(true);
    expect(wantsWebsiteDeliverable("Generate 3 logo concepts for my brand")).toBe(false);
  });

  it("detects code deliverables", () => {
    expect(wantsCodeDeliverable("Write a TypeScript Express route with Zod validation")).toBe(true);
    expect(wantsLongDeliverable("Build a React component for our pricing table")).toBe(true);
  });

  it("includes website and code guidance in system append", () => {
    const guidance = buildDirectorDeliverableGuidance(
      "Design a website and give me the HTML/CSS prototype",
    );
    expect(guidance).toContain("Universal deliverables");
    expect(guidance).toContain("Website / product design");
    expect(guidance).toContain("```html");
  });
});
