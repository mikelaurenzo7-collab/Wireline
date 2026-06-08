import { describe, expect, it } from "vitest";
import {
  architectsForVotePass,
  shouldRunArchitectVote,
  WIRELINE_DESIGN_TEAM,
  WIRELINE_DESIGN_TEAM_SPECTRUM,
} from "./director-design-team";

describe("WIRELINE_DESIGN_TEAM Spectrum Desk", () => {
  it("uses Spectrum roster as active team", () => {
    expect(WIRELINE_DESIGN_TEAM.id).toBe("spectrum");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.researcher.openRouterModelId).toBe(
      "deepseek/deepseek-v4-pro",
    );
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder.openRouterModelId).toBe(
      "qwen/qwen3-coder-plus",
    );
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.layoutScout.openRouterModelId).toBe(
      "stepfun/step-3.7-flash",
    );
  });

  it("uses Sonnet critic and MiniMax M3 finisher", () => {
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.visualCritic.openRouterModelId).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.productionFinisher.openRouterModelId).toBe(
      "minimax/minimax-m3",
    );
  });

  it("does not run architect voting passes", () => {
    expect(shouldRunArchitectVote(1)).toBe(false);
    expect(shouldRunArchitectVote(2)).toBe(false);
    expect(architectsForVotePass(1)).toHaveLength(0);
  });

  it("prefers Gemini hero images with Grok fallback", () => {
    expect(WIRELINE_DESIGN_TEAM.imageReference.openRouterModelId).toBe(
      "google/gemini-2.5-flash-image",
    );
    expect(WIRELINE_DESIGN_TEAM.altImageReference?.openRouterModelId).toBe(
      "x-ai/grok-imagine-image-quality",
    );
  });

  it("runs 2–3 refinement passes with optional Hy3 challenger", () => {
    expect(WIRELINE_DESIGN_TEAM.enableOptionalChallenger).toBe(true);
    expect(WIRELINE_DESIGN_TEAM.optionalChallenger.id).toBe("hy3");
    expect(WIRELINE_DESIGN_TEAM.minRefinementPasses).toBe(2);
    expect(WIRELINE_DESIGN_TEAM.maxRefinementPasses).toBe(3);
  });
});
