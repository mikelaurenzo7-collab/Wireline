import { describe, expect, it } from "vitest";
import {
  hasPendingStitchClarifyInHistory,
  resolveEffectiveStitchDeviceType,
  resolveStitchDeviceType,
  resolveStitchMediaOperation,
  shouldRouteDirectorMessageToStitch,
  wantsStitchMediaRequest,
  wantsWirelineProductDesign,
} from "./director-stitch-intent";

describe("director design intent", () => {
  it("routes website and hero media to design classifier", () => {
    expect(wantsStitchMediaRequest("Design a one-page website for a local HVAC company")).toBe(
      true,
    );
    expect(wantsStitchMediaRequest("Generate a hero image for our homepage")).toBe(true);
    expect(wantsStitchMediaRequest("Generate 3 logo concepts for my brand")).toBe(false);
  });

  it("routes admin dashboard requests to design classifier", () => {
    expect(
      wantsStitchMediaRequest(
        "make me an admin dashboard for this website — Wireline is the company",
      ),
    ).toBe(true);
  });

  it("detects explicit Wireline product design requests", () => {
    expect(wantsWirelineProductDesign("Design the Wireline Director mobile app screen")).toBe(true);
  });

  it("detects edit and variants when a legacy design session exists", () => {
    const session = { projectId: "123", screenId: "456" };
    expect(resolveStitchMediaOperation("Make the hero darker", session)).toBe("edit");
    expect(resolveStitchMediaOperation("Show 3 color variants", session)).toBe("variants");
    expect(resolveStitchMediaOperation("Build the full multi-page site", session)).toBe(
      "build_site",
    );
  });

  it("routes only when Design mode or clarify follow-up", () => {
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
      shouldRouteDirectorMessageToStitch("Make the hero darker", {
        stitchOptions: undefined,
      }),
    ).toBe(false);
  });

  it("uses desktop canvas for admin dashboards", () => {
    expect(resolveStitchDeviceType("make me an admin dashboard for trywireline.com")).toBe(
      "DESKTOP",
    );
  });

  it("defaults landing pages to desktop web viewport unless mobile is explicit", () => {
    expect(resolveStitchDeviceType("Design a landing page for Brightline")).toBe("DESKTOP");
    expect(resolveStitchDeviceType("Design a mobile landing page with hero and CTA")).toBe(
      "MOBILE",
    );
  });

  it("preserves prior device type for edit and variant follow-ups", () => {
    const session = { projectId: "123", screenId: "456", deviceType: "MOBILE" as const };

    expect(resolveEffectiveStitchDeviceType("Make the hero darker", session)).toBe("MOBILE");
    expect(resolveEffectiveStitchDeviceType("Show 3 color variants", session)).toBe("MOBILE");
    expect(resolveEffectiveStitchDeviceType("Make a desktop version", session)).toBe("DESKTOP");
  });
});
