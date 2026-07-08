import { describe, expect, it } from "vitest";
import { AUTHENTICATED_SURFACE_CONTRACT } from "../src/lib/authenticated-surface-contract";

describe("authenticated surfaces", () => {
  it("locks Aurora Letterpress as the live brand doctrine", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.system).toMatch(/Aurora/i);
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.doctrine).toMatch(/violet/i);
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.retired).toContain("forest green primary");
  });

  it("keeps settings and knowledge tabs on the Claude layout", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.settings.tabs).toEqual([
      "Account",
      "Billing",
      "Phone",
      "Team",
      "Branding",
      "Compliance",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.training.tabs).toEqual([
      "Knowledge",
      "Voice",
      "Flows",
      "Simulator",
    ]);
  });

  it("defines navigation groups and mobile dock IA", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.groups).toEqual([
      "Workspace",
      "Agents",
      "Operate",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.mobilePrimary).toEqual([
      "Overview",
      "Studio",
      "Phone",
      "Inbox",
      "More",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.mobileMore).toEqual([
      "Training",
      "Wire",
      "Approvals",
      "Insights",
      "Apps",
      "Settings",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.sourceOfTruth).toBe(
      "src/constants/navigation.ts",
    );
  });

  it("defines page chrome modes for authenticated surfaces", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.pageChrome.modes).toEqual([
      "standard",
      "narrow",
      "operate",
      "studio",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.pageChrome.standard.maxWidth).toBe("980px");
    expect(AUTHENTICATED_SURFACE_CONTRACT.pageChrome.narrow.maxWidth).toBe("700px");
    expect(AUTHENTICATED_SURFACE_CONTRACT.statePrimitives.soleEmpty).toMatch(/EmptyState/);
    expect(AUTHENTICATED_SURFACE_CONTRACT.statePrimitives.error).toMatch(/StatusNotice/);
  });

  it("uses overview as the assistant roster and studio as the canvas", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.overview).toMatch(
      /agent roster|health summary|next-action home/i,
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.studio).toMatch(/canvas|studio|chat/i);
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.agentsRoute).toMatch(
      /defensive redirect to overview/i,
    );
  });
});
