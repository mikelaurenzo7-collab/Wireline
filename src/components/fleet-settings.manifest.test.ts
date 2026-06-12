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
});
