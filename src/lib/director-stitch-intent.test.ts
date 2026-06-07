import { describe, expect, it } from "vitest";
import {
  buildStitchGenerationPrompt,
  CLIENT_STITCH_DELIVERY_BRIEF,
  hasPendingStitchClarifyInHistory,
  resolveEffectiveStitchDeviceType,
  resolveStitchMediaOperation,
  resolveStitchModelId,
  shouldRouteDirectorMessageToStitch,
  shouldRouteStitchSessionFollowUp,
  WIRELINE_STITCH_DESIGN_BRIEF,
  wantsStitchMediaRequest,
  wantsWirelineProductDesign,
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

  it("uses client delivery brief for tenant designs (not Wireline product UI)", () => {
    const prompt = buildStitchGenerationPrompt("Design a landing page hero", {
      businessName: "Acme Plumbing",
    });
    expect(prompt).toContain("Acme Plumbing");
    expect(prompt).toContain(CLIENT_STITCH_DELIVERY_BRIEF);
    expect(prompt).not.toContain(WIRELINE_STITCH_DESIGN_BRIEF);
    expect(prompt).toContain("semantic HTML");
  });

  it("uses Wireline product brief only when explicitly requested", () => {
    expect(wantsWirelineProductDesign("Design the Wireline Director mobile app screen")).toBe(true);
    const prompt = buildStitchGenerationPrompt(
      "Design the Wireline Director mission control dashboard",
    );
    expect(prompt).toContain(WIRELINE_STITCH_DESIGN_BRIEF);
  });

  it("condenses design.md to operator request for Stitch generate", () => {
    const md = [
      "# Design brief — Test",
      "### Operator request",
      "Design a mobile landing page with hero and CTA.",
      "## Delivery",
      "duplicate noise",
    ].join("\n");
    const prompt = buildStitchGenerationPrompt("fallback", { designBriefMarkdown: md });
    expect(prompt).toContain("mobile landing page with hero and CTA");
    expect(prompt).not.toContain("duplicate noise");
  });

  it("defaults client UI renders to GEMINI_3_1_PRO", () => {
    expect(resolveStitchModelId("Design a mobile landing page for a cleaning company")).toBe(
      "GEMINI_3_1_PRO",
    );
    expect(resolveStitchModelId("Design a meditation app onboarding screen")).toBe(
      "GEMINI_3_1_PRO",
    );
  });

  it("uses GEMINI_3_FLASH only when the operator asks for a fast draft", () => {
    expect(resolveStitchModelId("Quick draft of a mobile checkout screen")).toBe("GEMINI_3_FLASH");
  });

  it("detects edit and variants when a stitch session exists", () => {
    const session = { projectId: "123", screenId: "456" };
    expect(resolveStitchMediaOperation("Make the hero darker", session)).toBe("edit");
    expect(resolveStitchMediaOperation("Show 3 color variants", session)).toBe("variants");
    expect(resolveStitchMediaOperation("Build the full multi-page site", session)).toBe(
      "build_site",
    );
  });

  it("routes only when Design mode, clarify follow-up, or stitch session edit", () => {
    expect(
      shouldRouteDirectorMessageToStitch("Design a landing page", {
        stitchOptions: { designMode: true },
      }),
    ).toBe(true);
    expect(
      shouldRouteDirectorMessageToStitch("Design a landing page", {
        stitchOptions: undefined,
      }),
    ).toBe(false);
    expect(
      shouldRouteDirectorMessageToStitch("Stillmind is a consumer app", {
        history: [
          { role: "operator", content: "Design a mobile onboarding screen" },
          {
            role: "director",
            content: "Before I generate screens, I need a bit more context.",
          },
        ],
      }),
    ).toBe(true);
    expect(hasPendingStitchClarifyInHistory([])).toBe(false);
    expect(
      shouldRouteStitchSessionFollowUp("Make the hero darker", {
        projectId: "123",
        screenId: "456",
      }),
    ).toBe(true);
    expect(
      shouldRouteDirectorMessageToStitch("Make the hero darker", {
        stitchSession: { projectId: "123", screenId: "456" },
      }),
    ).toBe(true);
  });

  it("preserves prior device type for edit and variant follow-ups", () => {
    const session = { projectId: "123", screenId: "456", deviceType: "MOBILE" as const };

    expect(resolveEffectiveStitchDeviceType("Make the hero darker", session)).toBe("MOBILE");
    expect(resolveEffectiveStitchDeviceType("Show 3 color variants", session)).toBe("MOBILE");
    expect(resolveEffectiveStitchDeviceType("Make a desktop version", session)).toBe("DESKTOP");
  });
});
