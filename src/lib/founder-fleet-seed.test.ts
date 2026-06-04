import { describe, expect, it } from "vitest";
import {
  ALL_AGENT_TOOLS,
  FOUNDER_FLEET_TEMPLATES,
  founderFleetAgentScope,
  namespacedFleetAgentId,
} from "./founder-fleet-seed";
import { AGENT_TOOL_NAME_VALUES } from "./agent-capabilities";
import { WIRELINE_PERSONAS } from "./wireline-agent-personas";

describe("founder-fleet-seed", () => {
  it("scopes agent upserts to owner user_id", () => {
    expect(founderFleetAgentScope("wireline-sales", "owner-user-id")).toBeTruthy();
  });

  it("namespaces fleet ids for additional tenants", () => {
    expect(namespacedFleetAgentId("wireline-sales", "24efa49f-2b8e-45f4-beee-c85b01ca83d1")).toBe(
      "24efa49f-wireline-sales",
    );
  });

  it("exports all catalog tools for max-capability seeding", () => {
    expect(ALL_AGENT_TOOLS).toEqual([...AGENT_TOOL_NAME_VALUES]);
    expect(ALL_AGENT_TOOLS.length).toBeGreaterThan(40);
  });

  it("includes wireline personas plus specialty vertical agents", () => {
    expect(Object.keys(WIRELINE_PERSONAS)).toHaveLength(6);
    expect(FOUNDER_FLEET_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });
});
