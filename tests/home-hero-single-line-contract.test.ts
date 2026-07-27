import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const polish = readFileSync("src/styles/e2e-design-polish.css", "utf8");
const hero = readFileSync("src/components/marketing/MarketingHero.tsx", "utf8");

describe("home hero balanced-measure contract", () => {
  it("keeps the current voice-agent headline balanced and readable at every width", () => {
    expect(polish).toContain(".marketing-surface .wireline-home-hero .marketing-hero__title");
    expect(polish).toContain("text-wrap: balance");
    expect(polish).toContain("white-space: normal");
    expect(polish).toContain("max-width: min(100%, 19ch)");
    expect(polish).toMatch(/@media \(max-width: 639px\)[\s\S]*max-width:\s*12ch/);
    expect(hero).not.toContain("sm:whitespace-nowrap");
    expect(hero).toContain("max-w-[19ch]");
    expect(hero).toContain("text-balance");
  });
});
