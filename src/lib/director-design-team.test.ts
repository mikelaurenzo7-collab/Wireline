import { describe, expect, it } from "vitest";
import { CLAUDE_MODELS } from "./claude-models";
import {
  architectsForVotePass,
  shouldRunArchitectVote,
  SPECTRUM_GROK_BUILD_MODEL,
  SPECTRUM_KIMI_MODEL,
  WIRELINE_DESIGN_TEAM,
  WIRELINE_DESIGN_TEAM_SPECTRUM,
  WIRELINE_DESIGN_STUDIO_REASONING,
} from "./director-design-team";

describe("WIRELINE_DESIGN_TEAM Spectrum Desk", () => {
  it("uses Grok Build 0.1 as the sole HTML builder", () => {
    expect(WIRELINE_DESIGN_TEAM.id).toBe("spectrum");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder.openRouterModelId).toBe(
      SPECTRUM_GROK_BUILD_MODEL,
    );
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder.fallbackOpenRouterModelId).toBe(
      SPECTRUM_KIMI_MODEL,
    );
  });

  it("uses Claude Opus for creative vision and finish", () => {
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.creativeDirector.provider).toBe("wireline");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.creativeDirector.wirelineModel).toBe(CLAUDE_MODELS.OPUS);
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.reviewer.provider).toBe("wireline");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.reviewer.wirelineModel).toBe(CLAUDE_MODELS.OPUS);
  });

  it("does not run architect voting passes", () => {
    expect(shouldRunArchitectVote(1)).toBe(false);
    expect(shouldRunArchitectVote(2)).toBe(false);
    expect(architectsForVotePass(1)).toHaveLength(0);
  });

  it("does not use Grok Imagine in the active pipeline", () => {
    expect(WIRELINE_DESIGN_TEAM.imageReference.enabled).toBe(false);
    expect(WIRELINE_DESIGN_TEAM.altImageReference?.enabled).toBe(false);
  });

  it("runs a single Grok draft before Opus finish", () => {
    expect(WIRELINE_DESIGN_TEAM.enableOptionalChallenger).toBe(false);
    expect(WIRELINE_DESIGN_TEAM.minRefinementPasses).toBe(1);
    expect(WIRELINE_DESIGN_TEAM.maxRefinementPasses).toBe(1);
  });

  it("documents Opus vision, Grok draft, and Opus finish in studio reasoning", () => {
    expect(WIRELINE_DESIGN_STUDIO_REASONING).toMatch(/Opus vision/i);
    expect(WIRELINE_DESIGN_STUDIO_REASONING).toMatch(/Grok Build/i);
    expect(WIRELINE_DESIGN_STUDIO_REASONING).toMatch(/Opus finish/i);
  });
});
