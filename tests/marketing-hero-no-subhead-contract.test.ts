import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * Marketing heroes carry a headline, actions, and proof — no subhead.
 *
 * The home page dropped its subhead first, for a tighter and more confident
 * hero, but the prop survived and eight other pages still passed one. That left
 * two different hero shapes across the marketing surface, and on the pages that
 * used it the subhead restated the headline in a quieter voice directly beneath
 * it. The prop is now gone rather than merely unused, so the shape cannot drift
 * back one page at a time.
 *
 * Page descriptions for search and social are unaffected: those come from
 * `PageMeta`, not from anything the hero renders.
 */

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("marketing hero has no subhead", () => {
  it("does not accept a hero description prop", () => {
    const hero = source("src/components/marketing/MarketingHero.tsx");

    expect(hero, "MarketingHero must not declare a description prop").not.toMatch(
      /^\s*description\?:/m,
    );
    expect(hero, "MarketingHero must not render a hero subhead").not.toContain(
      "marketing-hero__description",
    );
    // The hero still has to render its headline and actions.
    expect(hero).toContain("{title}");
  });

  it("is not passed a subhead by any page", () => {
    const offenders: string[] = [];
    const files = globSync("src/{pages,components}/**/*.tsx", { cwd: root })
      .map((f) => f.replaceAll("\\", "/"))
      .filter((f) => source(f).includes("<MarketingHero"))
      .sort();

    expect(files.length, "no MarketingHero call sites found -- the glob changed").toBeGreaterThan(
      4,
    );

    for (const file of files) {
      const text = source(file);
      for (const m of text.matchAll(/<MarketingHero\b[\s\S]*?\/?>/g)) {
        if (/\bdescription=/.test(m[0])) offenders.push(file);
      }
    }

    expect(offenders, `pages passing a hero subhead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
