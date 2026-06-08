import { describe, expect, it } from "vitest";
import { WIRELINE_DESIGN_TEAM } from "./director-design-team";

describe("WIRELINE_DESIGN_TEAM", () => {
  it("uses Grok 4.3 builder and Opus 4.6 for research, review, and approval", () => {
    expect(WIRELINE_DESIGN_TEAM.builder.openRouterModelId).toBe("x-ai/grok-4.3");
    expect(WIRELINE_DESIGN_TEAM.researcher.wirelineModel).toBe("claude-opus-4-6");
    expect(WIRELINE_DESIGN_TEAM.codeReviewer.wirelineModel).toBe("claude-opus-4-6");
    expect(WIRELINE_DESIGN_TEAM.finalApprover.wirelineModel).toBe("claude-opus-4-6");
  });

  it("runs 2–3 refinement passes by default", () => {
    expect(WIRELINE_DESIGN_TEAM.minRefinementPasses).toBe(2);
    expect(WIRELINE_DESIGN_TEAM.maxRefinementPasses).toBe(3);
    expect(WIRELINE_DESIGN_TEAM.passScore).toBe(8);
  });

  it("disables image reference by default", () => {
    expect(WIRELINE_DESIGN_TEAM.imageReference.enabled).toBe(false);
  });
});
