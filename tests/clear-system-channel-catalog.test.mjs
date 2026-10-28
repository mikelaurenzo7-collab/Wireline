import { describe, expect, it } from "vitest";
import { createCheckContext } from "../scripts/clear-system/context.mjs";
import { checkLaunchStory } from "../scripts/clear-system/launch-story.mjs";
import { checkMarketingSurfaces } from "../scripts/clear-system/marketing-surfaces.mjs";
import { checkBillingIntegrity } from "../scripts/clear-system/billing-integrity.mjs";

function check(overrides = {}) {
  const context = createCheckContext();
  const input = {
    ...context,
    read(file) {
      const source = context.read(file);
      return overrides[file] ? overrides[file](source) : source;
    },
  };
  checkLaunchStory(input);
  checkMarketingSurfaces(input);
  checkBillingIntegrity(input);
  return context.failures;
}

describe("Clear System channel catalog guard", () => {
  it("accepts the current catalog-derived pricing, knowledge and personas", () => {
    expect(check()).toEqual([]);
  });

  it.each([
    [
      "src/components/marketing/WireAgentLanding.tsx",
      (source) =>
        source.replace(
          "The Bot Gets:",
          "Calling.",
        ),
      "root landing must introduce the Bot's three work surfaces",
    ],
    [
      "src/styles/landing-prestige.css",
      (source) => source.replaceAll("text-wrap: balance;", "text-wrap: wrap;"),
      "display headings must balance lines",
    ],
    [
      "src/lib/plan-display.ts",
      (source) => source.replace('high: "Pro"', 'high: "Scale"'),
      "preserve Pro",
    ],
    [
      "src/data/wireline-knowledge.ts",
      (source) => source.replace("PUBLIC_USAGE_TIERS.map", "ALL_USAGE_TIERS.map"),
      "derive public offers",
    ],
    [
      "src/data/wireline-knowledge.ts",
      (source) => `${source}\nconst retired = "BotBound Pro";`,
      "retired self-serve offers",
    ],
    [
      "src/lib/wireline-agent-personas.ts",
      (source) => `${source}\nconst discount = "Annual pricing saves two months";`,
      "invent annual discounts",
    ],
  ])("rejects a regressed offer surface in %s (%s)", (file, mutate, expected) => {
    const original = createCheckContext().read(file);
    expect(mutate(original), "mutation fixture must change current source").not.toBe(original);
    expect(check({ [file]: mutate }).some((failure) => failure.includes(expected))).toBe(true);
  });
});
