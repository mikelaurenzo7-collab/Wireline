import { describe, expect, it } from "vitest";

import {
  WIRELINE_FEATURES,
  WIRELINE_GROWTH_ENGINE,
  WIRELINE_ONE_LINER,
  WIRELINE_PLANS,
} from "./wireline-knowledge";
import { STRIPE_PLANS } from "../lib/plan-catalog";

describe("BotBound knowledge", () => {
  it("keeps public offer naming aligned with the launch catalog and brand law", () => {
    expect(WIRELINE_PLANS.map((plan) => plan.name)).toEqual([
      "BotBound Free Builder",
      ...STRIPE_PLANS.filter(
        (plan) => plan.catalogFamily === "channels" && !plan.channels.includes("sms"),
      ).map((plan) => plan.name),
      "BotBound Enterprise",
      "Runtime Balance",
    ]);

    expect(WIRELINE_PLANS.map((plan) => plan.price).join(" ")).not.toContain("Legacy");
    expect(WIRELINE_PLANS.map((plan) => plan.name)).not.toContain("BotBound Business");
    for (const plan of STRIPE_PLANS.filter(
      (plan) => plan.catalogFamily === "channels" && !plan.channels.includes("sms"),
    )) {
      const knowledge = WIRELINE_PLANS.find((item) => item.name === plan.name)!;
      expect(knowledge.price).toContain(`$${plan.price_usd_monthly}/mo`);
      expect(knowledge.price).toContain(`$${plan.price_usd_annual}/year`);
      if (!plan.channels.includes("email"))
        expect(knowledge.includes.join(" ")).not.toContain("mailbox included");
      if (!plan.channels.includes("voice"))
        expect(knowledge.includes.join(" ")).not.toContain("call minutes/month");
    }
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

  it("describes the focused launch offer without promoting business campaigns", () => {
    const combined = [
      WIRELINE_GROWTH_ENGINE,
      ...WIRELINE_FEATURES.map((feature) => feature.blurb),
    ].join(" ");

    expect(WIRELINE_GROWTH_ENGINE).toContain("consent rules, federal DNC screening");
    expect(WIRELINE_GROWTH_ENGINE).toContain(
      "Business outbound campaigns are not part of the current launch offer",
    );
    expect(
      WIRELINE_FEATURES.find((feature) => feature.title === "Personal Calls")?.blurb,
    ).toContain("Recipient permission is required");
    expect(
      WIRELINE_FEATURES.find((feature) => feature.title === "SMS Coming Soon")?.blurb,
    ).toContain("not part of the current launch offer");
    expect(combined).not.toContain("stays gated");
    expect(combined).not.toContain("launch outbound campaigns");
    expect(combined).not.toContain("campaigns that dial and qualify leads");
  });
});
