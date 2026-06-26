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
      "Wireline Personal",
      "Wireline Team",
      "Wireline Business",
      "Wireline Enterprise",
      "Conversation Balance",
    ]);

    expect(WIRELINE_PLANS.map((plan) => plan.price).join(" ")).not.toContain("Legacy");
    expect(WIRELINE_PLANS.map((plan) => plan.price).join(" ")).not.toContain("Plus");
  });

  it("keeps Personal and Team attached to the Conversation Balance model", () => {
    expect(WIRELINE_PLANS[0].price).toContain("Conversation Balance");
    expect(WIRELINE_PLANS[1].price).toContain("Conversation Balance");
    expect(WIRELINE_PLANS[4].name).toBe("Conversation Balance");
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
