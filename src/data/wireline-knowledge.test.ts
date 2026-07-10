import { describe, expect, it } from "vitest";

import {
  WIRELINE_FEATURES,
  WIRELINE_GROWTH_ENGINE,
  WIRELINE_ONE_LINER,
  WIRELINE_PLANS,
} from "./wireline-knowledge";

describe("wireline knowledge", () => {
  it("keeps public offer naming aligned with the launch catalog", () => {
    expect(WIRELINE_PLANS.map((plan) => plan.name)).toEqual([
      "Wireline Free Builder",
      "Wireline Starter",
      "Wireline Starter Plus",
      "Wireline Pro",
      "Wireline Business",
      "Conversation Balance",
    ]);

    expect(WIRELINE_PLANS.map((plan) => plan.price).join(" ")).not.toContain("Legacy");
  });

  it("keeps Free Builder locked out of live work and never promises balance-funded calls", () => {
    expect(WIRELINE_PLANS[0].name).toBe("Wireline Free Builder");
    expect(WIRELINE_PLANS[0].price).not.toContain("Conversation Balance");
    expect(WIRELINE_PLANS[0].includes.join(" ")).toMatch(/no live calls/);
    expect(WIRELINE_PLANS[5].name).toBe("Conversation Balance");
  });

  it("keeps shared product knowledge agent-forward", () => {
    const combined = [
      WIRELINE_ONE_LINER,
      WIRELINE_GROWTH_ENGINE,
      ...WIRELINE_FEATURES.map((feature) => feature.blurb),
    ].join(" ");

    expect(combined).not.toMatch(/\bAssistants\b/);
    expect(combined).toContain("agents");
  });
});
