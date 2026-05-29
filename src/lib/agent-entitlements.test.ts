import { describe, expect, it } from "vitest";
import { agentCapHit, resolveAgentEntitlement } from "./agent-entitlements";

describe("agent entitlements", () => {
  it("gives the founder account unlimited active agent capacity", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: true,
      subscriptionStatus: "trialing",
      maxAgents: 3,
      extraAgents: 0,
    });

    expect(entitlement).toMatchObject({
      subscriptionStatus: "active",
      planAgents: null,
      effectiveCap: null,
      unlimited: true,
    });
    expect(agentCapHit(10_000, entitlement)).toBe(false);
  });

  it("adds purchased extra agents to normal plan capacity", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus: "active",
      maxAgents: 3,
      extraAgents: 2,
    });

    expect(entitlement.effectiveCap).toBe(5);
    expect(agentCapHit(4, entitlement)).toBe(false);
    expect(agentCapHit(5, entitlement)).toBe(true);
  });
});
