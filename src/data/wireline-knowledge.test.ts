import { describe, expect, it } from "vitest";
import {
  WIRELINE_FEATURES,
  WIRELINE_GROWTH_ENGINE,
  WIRELINE_ONE_LINER,
  WIRELINE_PLANS,
} from "./wireline-knowledge";
import { PUBLIC_USAGE_TIERS, USAGE_TIERS } from "../lib/usage-billing-catalog";

describe("BotBound knowledge", () => {
  it("quotes only the current public plans and their included identities", () => {
    expect(WIRELINE_PLANS).toHaveLength(PUBLIC_USAGE_TIERS.length);
    PUBLIC_USAGE_TIERS.forEach((id, index) => {
      const plan = USAGE_TIERS[id];
      const knowledge = WIRELINE_PLANS[index];
      expect(knowledge.name).toBe(plan.name);
      expect(knowledge.price).toBe(`$${plan.monthlyUsd}/mo`);
      expect(knowledge.includes).toContain(`$${plan.includedWorkUsd} of shared work each month`);
      expect(knowledge.includes.join(" ")).toContain(`${plan.includedNumbers} phone number`);
      expect(knowledge.includes.join(" ")).toContain(
        `${plan.includedEmailAddresses} email address`,
      );
      expect(knowledge.bestFor).toContain("one shared allowance");
    });
    expect(JSON.stringify(WIRELINE_PLANS)).not.toMatch(/Enterprise|Runtime Balance|annual/);
  });

  it("keeps shared product knowledge Bot-forward", () => {
    const combined = [
      WIRELINE_ONE_LINER,
      WIRELINE_GROWTH_ENGINE,
      ...WIRELINE_FEATURES.map((feature) => feature.blurb),
    ].join(" ");
    expect(combined).not.toMatch(/\bAssistants\b|\bagents\b/i);
    expect(combined).toMatch(/\bBots?\b/);
    expect(combined).toContain("BotBound");
  });

  it("describes sales and SMS without claiming that a subscription clears activation checks", () => {
    expect(WIRELINE_GROWTH_ENGINE).toContain("qualify leads");
    expect(WIRELINE_GROWTH_ENGINE).toContain("consent rules, federal DNC screening");
    expect(WIRELINE_GROWTH_ENGINE).toContain("check its account's current activation status");
    expect(WIRELINE_FEATURES.find((feature) => feature.title === "SMS")?.blurb).toContain(
      "Sender registration, recipient permission, and opt-out controls",
    );
    expect(
      WIRELINE_FEATURES.find((feature) => feature.title === "Personal Calls")?.blurb,
    ).toContain("Recipient permission is required");
    expect(JSON.stringify(WIRELINE_FEATURES)).not.toMatch(
      /Coming Soon|not part of the current launch offer/,
    );
  });
});
