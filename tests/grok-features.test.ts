import { describe, expect, it } from "vitest";
import {
  GROK_AGENT_STRENGTHS,
  buildGrokStrengthsPromptSection,
  isGrokModelId,
} from "../src/lib/grok-features";

describe("grok-features", () => {
  it("detects Grok model ids", () => {
    expect(isGrokModelId("grok-4.6")).toBe(true);
    expect(isGrokModelId("x-ai/grok-4.5")).toBe(true);
    expect(isGrokModelId("Grok-2")).toBe(true);
    expect(isGrokModelId("google/gemini-1.5-flash")).toBe(false);
    expect(isGrokModelId(null)).toBe(false);
  });

  it("builds a neutral strengths section for runtime prompts", () => {
    const section = buildGrokStrengthsPromptSection();
    for (const strength of Object.values(GROK_AGENT_STRENGTHS)) {
      expect(section).toContain(strength);
    }
    expect(section).toContain("maximally truthful");
    expect(section).not.toMatch(/\bgrok\b/i);
  });
});
