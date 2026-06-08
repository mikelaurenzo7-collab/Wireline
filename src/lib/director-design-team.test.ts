import { describe, expect, it } from "vitest";
import { CLAUDE_MODELS } from "./claude-models";
import {
  architectsForVotePass,
  assertWirelineDesignRole,
  shouldRunArchitectVote,
  SPECTRUM_DEEPSEEK_MODEL,
  SPECTRUM_KIMI_MODEL,
  SPECTRUM_PAINTER_OPUS_MODEL,
  WIRELINE_DESIGN_TEAM,
  WIRELINE_DESIGN_TEAM_SPECTRUM,
  WIRELINE_DESIGN_STUDIO_REASONING,
} from "./director-design-team";

describe("WIRELINE_DESIGN_TEAM Spectrum Desk", () => {
  it("uses Kimi K2.6 as primary HTML builder with DeepSeek fallback", () => {
    expect(WIRELINE_DESIGN_TEAM.id).toBe("spectrum");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder.openRouterModelId).toBe(SPECTRUM_KIMI_MODEL);
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder.fallbackOpenRouterModelId).toBe(
      SPECTRUM_DEEPSEEK_MODEL,
    );
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder.openRouterModelId).not.toMatch(/anthropic/i);
  });

  it("uses Claude Opus via Anthropic wireline for preparer roles", () => {
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.creativeDirector.provider).toBe("wireline");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.creativeDirector.wirelineModel).toBe(CLAUDE_MODELS.OPUS);
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.reviewer.provider).toBe("wireline");
    expect(WIRELINE_DESIGN_TEAM_SPECTRUM.reviewer.wirelineModel).toBe(SPECTRUM_PAINTER_OPUS_MODEL);
    expect(SPECTRUM_PAINTER_OPUS_MODEL).toBe("claude-opus-4-8");
  });

  it("rejects OpenRouter roles for preparer slots", () => {
    expect(() =>
      assertWirelineDesignRole(WIRELINE_DESIGN_TEAM_SPECTRUM.htmlBuilder, "creativeDirector"),
    ).toThrow(/Anthropic wireline/);
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

  it("runs a single Kimi draft before Opus finish", () => {
    expect(WIRELINE_DESIGN_TEAM.enableOptionalChallenger).toBe(false);
    expect(WIRELINE_DESIGN_TEAM.minRefinementPasses).toBe(1);
    expect(WIRELINE_DESIGN_TEAM.maxRefinementPasses).toBe(1);
  });

  it("documents Opus prep, Kimi draft, and Opus finish in studio reasoning", () => {
    expect(WIRELINE_DESIGN_STUDIO_REASONING).toMatch(/Opus prep/i);
    expect(WIRELINE_DESIGN_STUDIO_REASONING).toMatch(/Kimi draft/i);
    expect(WIRELINE_DESIGN_STUDIO_REASONING).toMatch(/Opus finish/i);
  });
});
