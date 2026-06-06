import { describe, expect, it } from "vitest";
import { isCreativeIntent } from "./director-logo-tools";
import {
  buildDirectorDeliverableGuidance,
  wantsCodeDeliverable,
  wantsLogoCreativePath,
  wantsLongDeliverable,
  wantsStitchMediaRequest,
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
    expect(isCreativeIntent("Generate 3 logo concepts for my brand")).toBe(true);
    expect(isCreativeIntent("Design a new website for my HVAC business")).toBe(false);
    expect(isCreativeIntent("Generate a hero image for our homepage")).toBe(false);
  });

  it("detects code deliverables", () => {
    expect(wantsCodeDeliverable("Write a TypeScript Express route with Zod validation")).toBe(true);
    expect(wantsLongDeliverable("Build a React component for our pricing table")).toBe(true);
    expect(
      wantsCodeDeliverable("Write a short function that validates US phone numbers with Zod"),
    ).toBe(true);
    expect(wantsCodeDeliverable("Help me build a webhook handler for Stripe")).toBe(true);
  });

  it("detects stitch media without capability chips", () => {
    expect(wantsStitchMediaRequest("Design a landing page for my plumbing business")).toBe(true);
    expect(wantsStitchMediaRequest("Write a Zod validator for emails")).toBe(false);
  });

  it("treats stitch design asks as long deliverables for retry policy", () => {
    expect(wantsLongDeliverable("Design a mobile app UI mockup for booking")).toBe(true);
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
