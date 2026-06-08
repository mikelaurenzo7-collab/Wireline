import { describe, expect, it } from "vitest";
import {
  buildDesignVisionSpec,
  DESIGN_VISION_SPEC_MIN_CHARS,
  DESIGN_VISION_SPEC_TARGET_CHARS,
} from "./director-design-vision";

describe("buildDesignVisionSpec", () => {
  const base = {
    operatorMessage: "Design a landing page for Summit Landscaping — Denver homeowners, emergency tree work.",
    designBriefMarkdown: [
      "# Design brief — Summit Landscaping",
      "## Brand",
      "Summit Landscaping · Denver CO",
      "### Operator request",
      "Landing page with hero, trust badges, services, call CTA.",
      "## Visual system",
      "Earthy greens, cream surfaces, Fraunces + DM Sans.",
    ].join("\n"),
    researchNotes:
      "US audience: anxious homeowners after storms. Trust: licensed arborists, insured, same-day. Avoid generic lawn-care clipart.",
    layoutScoutNotes: "Archetype A: asymmetric hero with photo bleed. Archetype B: split hero with stat column.",
  };

  it("targets ~5000 characters for pass-1 builder context", () => {
    const spec = buildDesignVisionSpec(base);
    expect(spec).toContain("Wireline Design Vision Spec");
    expect(spec).toContain("High-fidelity production landing page");
    expect(spec).toContain("Summit Landscaping");
    expect(spec).toContain("Section-by-section blueprint");
    expect(spec.length).toBeGreaterThanOrEqual(DESIGN_VISION_SPEC_MIN_CHARS);
    expect(spec.length).toBeLessThanOrEqual(DESIGN_VISION_SPEC_TARGET_CHARS + 500);
  });
});
