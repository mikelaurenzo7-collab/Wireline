import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The selected shared-work plan CTA must use the canonical marketing button. */

const root = process.cwd();
const pricing = readFileSync(
  resolve(root, "src/components/usage-billing/UsagePricingPanel.tsx"),
  "utf8",
);

/** The `<Link>` blocks that terminate a plan card. */
function planCtaLinks(): string[] {
  return [...pricing.matchAll(/<Link\b[\s\S]*?<\/Link>/g)]
    .map((m) => m[0])
    .filter((block) => /signupHrefForPlan\("usage"/.test(block));
}

describe("pricing plan CTA case contract", () => {
  it("finds the plan CTAs it is meant to guard", () => {
    expect(planCtaLinks().length, "shared-work CTA not found -- the markup changed").toBe(2);
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
