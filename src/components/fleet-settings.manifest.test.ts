/**
 * Agents fleet page must not mount the Settings admin tab strip.
 * Sub-tab labels live in page-sub-tabs (AppShell chrome), not FleetSettings.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_PAGE_SUB_TAB_ROUTES } from "../lib/page-sub-tabs";

const SRC = readFileSync(join(import.meta.dirname, "fleet-settings", "FleetSettings.tsx"), "utf8");

describe("FleetSettings shell", () => {
  it("uses ClientRouteViewport (not AdminHubViewport / Settings tabs)", () => {
    expect(SRC).toContain("ClientRouteViewport");
    expect(SRC).not.toContain("AdminHubViewport");
  });

  it("is one open canvas — no front-door sub-tab wall", () => {
    // The Studio deliberately has no /agents sub-tabs: it lands on the build
    // canvas, and templates are summoned via local view state, not a tab.
    const agentsRoute = APP_PAGE_SUB_TAB_ROUTES.find((r) => r.pathname === "/agents");
    expect(agentsRoute).toBeUndefined();
    expect(SRC).not.toContain("resolveAppPageSubTabId");
    expect(SRC).not.toContain("SettingsTabSwitcher");
    // Build canvas is the default; templates are a summoned starting point.
    expect(SRC).toContain('useState<"canvas" | "templates">("canvas")');
  });

  it("centers the Director chat and keeps tuning in a separate rail", () => {
    expect(SRC).toContain('data-testid="studio-director-center"');
    expect(SRC).toContain("<DirectorWorkspace");
    expect(SRC).toContain('data-testid="studio-tuning-rail"');
    expect(SRC).toContain("<AgentConfigPanel");
    expect(SRC.indexOf("<DirectorWorkspace")).toBeLessThan(SRC.indexOf("<AgentConfigPanel"));
  });

  it("anchors the canvas with an identity hero + readiness ribbon above the docked Assistant", () => {
    // Identity (name + vitals) and a compact launch-readiness ribbon live up top
    // in the center canvas; the Assistant is a focused chat docked below them and
    // grows to fill the remaining height (no fixed cap, so it never clips on
    // laptop/desktop viewports).
    expect(SRC).toContain("<AgentIdentityVitals");
    expect(SRC).toContain("<AgentReadinessStage");
    expect(SRC.indexOf("<AgentIdentityVitals")).toBeLessThan(SRC.indexOf("<AgentReadinessStage"));
    expect(SRC.indexOf("<AgentReadinessStage")).toBeLessThan(SRC.indexOf("<DirectorWorkspace"));
    // The Assistant dock grows to fill the canvas rather than a fixed-height pane.
    expect(SRC).toContain("flex flex-1 flex-col min-h-0");
  });
});
