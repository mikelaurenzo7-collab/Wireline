import { describe, expect, it } from "vitest";
import { CLAUDE_MODELS } from "./claude-models";
import {
  architectsForVotePass,
  shouldRunArchitectVote,
  SPECTRUM_HY3_MODEL,
  SPECTRUM_KIMI_MODEL,
  SPECTRUM_MINIMAX_M3_MODEL,
  WIRELINE_DESIGN_TEAM,
  WIRELINE_DESIGN_TEAM_SPECTRUM,
  WIRELINE_DESIGN_STUDIO_REASONING,
} from "./director-design-team";

describe("WIRELINE_DESIGN_TEAM Spectrum Desk", () => {
  it("uses Kimi · Hy3 · M3 trio on OpenRouter", () => {
    expect(WIRELINE_DESIGN_TEAM.id).toBe("spectrum");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.researcher.openRouterModelId).toBe(SPECTRUM_KIMI_MODEL);
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.layoutScout.openRouterModelId).toBe(SPECTRUM_KIMI_MODEL);
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder.openRouterModelId).toBe(SPECTRUM_HY3_MODEL);
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.visualCritic.openRouterModelId).toBe(SPECTRUM_KIMI_MODEL);
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.productionFinisher.openRouterModelId).toBe(
      SPECTRUM_MINIMAX_M3_MODEL,
    );
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.usLocalization.openRouterModelId).toBe(SPECTRUM_KIMI_MODEL);
  });

  it("uses Claude Opus for final operator sign-off", () => {
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.finalApprover.provider).toBe("wireline");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.finalApprover.wirelineModel).toBe(CLAUDE_MODELS.OPUS);
  });

  it("does not run architect voting passes", () => {
    expect(shouldRunArchitectVote(1)).toBe(false);
    expect(shouldRunArchitectVote(2)).toBe(false);
    expect(architectsForVotePass(1)).toHaveLength(0);
  });

  it("uses Grok Imagine only for hero photography", () => {
    expect(WIRELINE_DESIGN_TEAM.imageReference.openRouterModelId).toBe(
      "x-ai/grok-imagine-image-quality",
    );
    expect(WIRELINE_DESIGN_TEAM.altImageReference?.enabled).toBe(false);
  });

  it("exits early when quality gate passes", () => {
    expect(WIRELINE_DESIGN_TEAM.enableOptionalChallenger).toBe(false);
    expect(WIRELINE_DESIGN_TEAM.minRefinementPasses).toBe(1);
    expect(WIRELINE_DESIGN_TEAM.maxRefinementPasses).toBe(2);
  });

  it("runs a single full pass when the quality gate passes", () => {
    expect(WIRELINE_DESIGN_TEAM.minRefinementPasses).toBe(1);
    expect(WIRELINE_DESIGN_TEAM.maxRefinementPasses).toBe(2);
  });

  it("documents Opus in studio reasoning", () => {
    expect(WIRELINE_DESIGN_STUDIO_REASONING).toMatch(/Opus/i);
  });
});
