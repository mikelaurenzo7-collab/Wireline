import { describe, expect, it } from "vitest";
import {
  PAINTER_STARTER_PROMPTS,
  PAINTER_STARTER_PROMPTS_FEATURED_COUNT,
  WIRELINE_PAINTER_UI,
} from "./wireline-painter-design";

describe("WIRELINE_PAINTER_UI", () => {
  it("ships design-studio starter prompts", () => {
    expect(PAINTER_STARTER_PROMPTS.length).toBeGreaterThanOrEqual(
      PAINTER_STARTER_PROMPTS_FEATURED_COUNT,
    );
    expect(PAINTER_STARTER_PROMPTS.every((p) => p.label.length > 10)).toBe(true);
  });

  it("builds handoff link with encoded prompt", () => {
    const reply = WIRELINE_PAINTER_UI.buildHandoffReply("Design a HVAC landing page");
    expect(reply).toContain("/design?prompt=");
    expect(reply).toContain(encodeURIComponent("Design a HVAC landing page"));
    expect(reply).toMatch(/Painter/i);
    expect(reply).toMatch(/Logos/i);
  });

  it("truncates very long prompts in handoff URLs", () => {
    const long = "x".repeat(3000);
    const reply = WIRELINE_PAINTER_UI.buildHandoffReply(long);
    const match = reply.match(/prompt=([^)\]]+)/);
    expect(match).toBeTruthy();
    expect(decodeURIComponent(match![1]!).length).toBeLessThanOrEqual(2000);
  });
});
