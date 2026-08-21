import { describe, expect, it } from "vitest";

import {
  WIRELINE_FEATURES,
  WIRELINE_GROWTH_ENGINE,
  WIRELINE_ONE_LINER,
  WIRELINE_PLANS,
} from "./wireline-knowledge";

describe("BotBound knowledge", () => {
  it("keeps public offer naming aligned with the launch catalog and brand law", () => {
    expect(WIRELINE_PLANS.map((plan) => plan.name)).toEqual([
      "BotBound Free Builder",
      "BotBound Starter",
      "BotBound Starter Plus",
      "BotBound Pro",
      "BotBound Scale & Enterprise",
      "Runtime Balance",
    ]);

    expect(WIRELINE_PLANS.map((plan) => plan.price).join(" ")).not.toContain("Legacy");
    expect(WIRELINE_PLANS.map((plan) => plan.price).join(" ")).not.toContain("$159");
  });

  it("keeps Free Builder locked out of live work and never promises balance-funded calls", () => {
    expect(WIRELINE_PLANS[0].name).toBe("BotBound Free Builder");
    expect(WIRELINE_PLANS[0].price).not.toContain("Runtime Balance");
    expect(WIRELINE_PLANS[0].includes.join(" ")).toMatch(/no live calls/);
    expect(WIRELINE_PLANS.at(-1)?.name).toBe("Runtime Balance");
  });

  it("keeps shared product knowledge Bot-forward", () => {
    const combined = [
      WIRELINE_ONE_LINER,
      WIRELINE_GROWTH_ENGINE,
      ...WIRELINE_FEATURES.map((feature) => feature.blurb),
    ].join(" ");

    expect(combined).not.toMatch(/\bAssistants\b/);
    expect(combined).not.toMatch(/\bagents\b/i);
    expect(combined).toMatch(/\bBots?\b/);
    expect(combined).toContain("BotBound");
  });
});
