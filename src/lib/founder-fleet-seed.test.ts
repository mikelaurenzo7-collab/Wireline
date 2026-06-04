import { describe, expect, it } from "vitest";
import { ALL_AGENT_TOOLS, FOUNDER_FLEET_TEMPLATES } from "./founder-fleet-seed";
import { AGENT_TOOL_NAME_VALUES } from "./agent-capabilities";
import { WIRELINE_PERSONAS } from "./wireline-agent-personas";

describe("founder-fleet-seed", () => {
  it("exports all catalog tools for max-capability seeding", () => {
    expect(ALL_AGENT_TOOLS).toEqual([...AGENT_TOOL_NAME_VALUES]);
    expect(ALL_AGENT_TOOLS.length).toBeGreaterThan(40);
  });

  it("includes wireline personas plus specialty vertical agents", () => {
    expect(Object.keys(WIRELINE_PERSONAS)).toHaveLength(6);
    expect(FOUNDER_FLEET_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });
});
