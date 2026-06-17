import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MAP_SRC = readFileSync(join(import.meta.dirname, "TuningRailMap.tsx"), "utf8");
const FLEET_SRC = readFileSync(join(import.meta.dirname, "FleetSettings.tsx"), "utf8");

describe("TuningRailMap", () => {
  it("contains the expected rail sections", () => {
    expect(MAP_SRC).toContain("Name + role");
    expect(MAP_SRC).toContain("Voice");
    expect(MAP_SRC).toContain("Model");
    expect(MAP_SRC).toContain("Number");
    expect(MAP_SRC).toContain("Training");
  });

  it("is mounted before the detailed controls", () => {
    expect(FLEET_SRC.indexOf("<TuningRailMap")).toBeGreaterThan(-1);
    expect(FLEET_SRC.indexOf("<TuningRailMap")).toBeLessThan(
      FLEET_SRC.indexOf("<AgentConfigPanel"),
    );
  });
});
