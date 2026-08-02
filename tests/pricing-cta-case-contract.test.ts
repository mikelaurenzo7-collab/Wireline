import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every plan card on /pricing ends in the same call to action, and case is what
 * ranks this design — so those six buttons have to speak in one voice.
 *
 * They did not. The four paid tiers carried `marketing-btn-primary` /
 * `marketing-btn-secondary`, which puts them in the cased control tier, while
 * the Free and Scale cards were hand-rolled `border border-border` links. Those
 * two fell outside the tier entirely and rendered exactly as their strings were
 * typed, so one row of plan cards showed "BUILD FREE" and "Build free" styling
 * side by side on the highest-intent page in the product.
 *
 * The rule this pins: a plan CTA joins the shared button classes rather than
 * re-deriving a border. That keeps casing systematic — `text-transform` decides,
 * not how an individual label happened to be capitalized in the source.
 */

const root = process.cwd();
const pricing = readFileSync(resolve(root, "src/pages/Pricing.tsx"), "utf8");

/** The `<Link>` blocks that terminate a plan card. */
function planCtaLinks(): string[] {
  return [...pricing.matchAll(/<Link\b[\s\S]*?<\/Link>/g)]
    .map((m) => m[0])
    .filter((block) => /min-h-11[^"]*w-full/.test(block));
}

describe("pricing plan CTA case contract", () => {
  it("finds the plan CTAs it is meant to guard", () => {
    // Three call sites render six buttons: the Free card, one template mapped
    // over the four paid tiers, and the Scale card. Asserting the count keeps a
    // markup refactor from silently reducing this file to an empty loop that
    // passes because it found nothing to check.
    expect(planCtaLinks().length, "plan CTA links not found -- the markup changed").toBe(3);
  });

  it("puts every plan CTA in the shared cased button tier", () => {
    for (const block of planCtaLinks()) {
      const label = block.replace(/\s+/g, " ").slice(0, 90);
      expect(block, `plan CTA is outside the cased control tier: ${label}`).toMatch(
        /marketing-btn-(primary|secondary)/,
      );
    }
  });

  it("does not let a plan CTA re-derive its own border instead of using the tier", () => {
    for (const block of planCtaLinks()) {
      const label = block.replace(/\s+/g, " ").slice(0, 90);
      // `border border-border` was exactly how the Free and Scale cards opted
      // themselves out of the shared button styling in the first place.
      expect(
        block,
        `plan CTA hand-rolls a border instead of the shared tier: ${label}`,
      ).not.toMatch(/\bborder border-border\b/);
    }
  });
});
