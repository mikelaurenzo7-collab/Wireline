/**
 * Agents fleet page must not mount the Settings admin tab strip.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(import.meta.dirname, "FleetSettings.tsx"), "utf8");

describe("FleetSettings shell", () => {
  it("uses ClientRouteViewport (not AdminHubViewport / Settings tabs)", () => {
    expect(SRC).toContain("ClientRouteViewport");
    expect(SRC).not.toContain("AdminHubViewport");
  });

  it("exposes Templates and My Fleet sub-tabs only", () => {
    expect(SRC).toContain('"Templates"');
    expect(SRC).toContain('"My Fleet"');
    expect(SRC).not.toContain("SettingsTabSwitcher");
  });
});
