import { describe, expect, it } from "vitest";
import { AUTHENTICATED_SURFACE_CONTRACT } from "../src/lib/authenticated-surface-contract";

describe("authenticated surfaces", () => {
  it("locks the single BotBound Design System and semantic doctrine", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.system).toBe("BotBound Design System");
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.doctrine).toMatch(/near-black canvas/i);
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.doctrine).toMatch(/violet/i);
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.namingRule).toMatch(
      /only customer-facing product name/i,
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.retired).toContain(
      "Letterpress as a design-system name",
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.retired).toContain(
      "Obsidian as a design-system name",
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.retired).toContain("forest green primary");
    expect(AUTHENTICATED_SURFACE_CONTRACT.brand.retired).toContain(
      "the pre-BotBound customer-facing company name",
    );
  });

  it("keeps settings and knowledge tabs on the current task-first layout", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.settings.tabs).toEqual([
      "Account",
      "Billing",
      "Team",
      "Appearance",
      "Apps",
      "Compliance",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.training.tabs).toEqual(["Knowledge", "Reports"]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.settings.phoneOwnership).toContain("Calls → Lines");
  });

  it("defines navigation groups and mobile dock IA", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.groups).toEqual(["Work", "Manage"]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.mobilePrimary).toEqual([
      "Workspace",
      "Inbox",
      "Calls",
      "Insights",
      "More",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.mobileMore).toEqual([
      "Calendar",
      "Connections",
      "Settings",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.workspaceSections).toEqual([
      "Set Up",
      "Knowledge",
      "Computer",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.sourceOfTruth).toBe(
      "src/constants/navigation.ts",
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.navigation.doctrine).toContain("The Workspace is home");
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

  it("uses the Workspace as the canonical home and redirects retired competing roster/dashboard routes", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.studio).toMatch(
      /canonical home|Bot workspace|create|configure|test/i,
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.overviewRoute).toMatch(
      /compatibility redirect to the Workspace/i,
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.agentsRoute).toMatch(
      /compatibility redirect to the Workspace/i,
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.workspaceRoute).toMatch(/stays \/studio/);
  });
});
