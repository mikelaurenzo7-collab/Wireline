import { describe, expect, it } from "vitest";
import {
  buildDesignBuilderUserPrompt,
  buildDesignRefinementUserPrompt,
} from "./director-design-prompts";

const brief = "# Design brief\nAudience: Denver homeowners\n".repeat(40);
const html = "<!doctype html><html><body class='wl-page'><h1 class='wl-headline'>Test</h1></body></html>";

describe("design prompts pass shaping", () => {
  it("pass 1 builder prompt is vision-heavy (~5k+ with kit)", () => {
    const prompt = buildDesignBuilderUserPrompt({
      operatorMessage: "Design a plumbing landing page for emergency calls",
      designBriefMarkdown: brief,
      researchNotes: "Research notes here.",
      layoutScoutNotes: "Layout A, Layout B.",
      passNumber: 1,
    });
    expect(prompt).toContain("Wireline Design Vision Spec");
    expect(prompt.length).toBeGreaterThan(4_500);
  });

  it("pass 2 refinement prompt stays focused and shorter", () => {
    const vision = buildDesignBuilderUserPrompt({
      operatorMessage: "Design a plumbing landing page",
      designBriefMarkdown: brief,
      researchNotes: "Research.",
      layoutScoutNotes: "Layout.",
      passNumber: 1,
    });
    const refinement = buildDesignRefinementUserPrompt({
      operatorMessage: "Design a plumbing landing page",
      designBriefMarkdown: brief,
      html,
      passNumber: 2,
      revisionNotes: "Fix CTA contrast.",
    });
    expect(refinement.length).toBeLessThan(vision.length * 0.65);
    expect(refinement).toContain("Must fix");
    expect(refinement).not.toContain("Wireline Design Vision Spec");
  });
});
