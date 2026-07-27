import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const polish = readFileSync("src/styles/public-marketing-polish.css", "utf8");
const hero = readFileSync("src/components/marketing/MarketingHero.tsx", "utf8");

describe("home hero single-line desktop contract", () => {
  it("keeps the current voice-agent headline on one line from sm+ and allows a mobile wrap", () => {
    expect(polish).toContain(".wireline-home-hero .marketing-hero__title");
    expect(polish).toContain("text-wrap: nowrap");
    expect(polish).toContain("max-width: min(100%, 16ch)");
    expect(polish).toMatch(/@media \(max-width: 639px\)[\s\S]*max-width:\s*10ch/);
    expect(hero).toContain("sm:whitespace-nowrap");
    expect(hero).toContain("max-w-[24ch]");
    expect(polish).not.toMatch(
      /\.wireline-home-hero \.marketing-hero__title \{\s*max-width:\s*15ch/,
    );
  });
});
