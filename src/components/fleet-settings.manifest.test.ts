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

  it("routes templates vs fleet via app chrome sub-tabs", () => {
    const agentsRoute = APP_PAGE_SUB_TAB_ROUTES.find((r) => r.pathname === "/agents");
    expect(agentsRoute?.tabs.map((t) => t.label)).toEqual(["Templates", "My Fleet"]);
    expect(SRC).toContain("resolveAppPageSubTabId");
    expect(SRC).not.toContain("SettingsTabSwitcher");
  });
});
