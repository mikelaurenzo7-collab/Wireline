import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const polish = readFileSync("src/styles/e2e-design-polish.css", "utf8");
const hero = readFileSync("src/components/marketing/MarketingHero.tsx", "utf8");

/**
 * The home headline has to wrap well at every width. It does not have to be
 * short.
 *
 * This contract used to pin the measure at exactly 19ch, and 12ch on phones,
 * which made any headline longer than about three words fail a test rather than
 * a design review. What actually matters is that the headline balances its
 * lines instead of breaking raggedly, never forces a nowrap that overflows a
 * phone, and keeps a measure in the readable display range.
 */
function measureFromClamp(source: string, pattern: RegExp): number {
  const match = source.match(pattern);
  expect(match, `expected a ch measure matching ${pattern}`).not.toBeNull();
  return Number(match![1]);
}

describe("home hero balanced-measure contract", () => {
  it("balances the headline rather than capping how much it can say", () => {
    const titleBlock = hero.slice(hero.indexOf("<h1"), hero.indexOf("</h1>"));

    expect(polish).toContain(".marketing-surface .wireline-home-hero .marketing-hero__title");
    expect(polish).toContain("text-wrap: balance");
    expect(polish).toContain("white-space: normal");
    // A nowrap headline overflows the moment the copy grows.
    expect(titleBlock).not.toContain("sm:whitespace-nowrap");
    expect(titleBlock).toContain("text-balance");

    const desktop = measureFromClamp(polish, /max-width:\s*min\(100%,\s*(\d+)ch\)/);
    expect(desktop).toBeGreaterThanOrEqual(24);
    expect(desktop).toBeLessThanOrEqual(42);

    const phone = measureFromClamp(
      polish.slice(polish.indexOf("@media (max-width: 639px)")),
      /max-width:\s*(\d+)ch/,
    );
    expect(phone).toBeGreaterThanOrEqual(16);
    expect(phone).toBeLessThanOrEqual(28);

    const utility = measureFromClamp(titleBlock, /max-w-\[(\d+)ch\]/);
    expect(utility).toBe(desktop);
  });

  it("lets a hero carry one supporting line under the headline", () => {
    expect(hero).toMatch(/^\s*description\?:/m);
    expect(hero).toContain("marketing-hero__description");
  });
});
