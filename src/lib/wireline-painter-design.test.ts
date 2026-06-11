import { describe, expect, it } from "vitest";
import {
  PAINTER_INTEGRATION_RAIL,
  PAINTER_LOAD_FAILED_COPY,
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

  it("ships export-lane rail copy", () => {
    expect(PAINTER_INTEGRATION_RAIL.ariaLabel.length).toBeGreaterThan(5);
    expect(PAINTER_INTEGRATION_RAIL.connectPrefix).toMatch(/connect/i);
    expect(PAINTER_INTEGRATION_RAIL.connectedHint).toMatch(/connected/i);
  });

  it("ships an actionable load-failure state with a retry affordance", () => {
    expect(PAINTER_LOAD_FAILED_COPY.title).toMatch(/couldn't load/i);
    expect(PAINTER_LOAD_FAILED_COPY.body.length).toBeGreaterThan(20);
    expect(PAINTER_LOAD_FAILED_COPY.retryLabel).toMatch(/retry/i);
  });

  it("ships a design-specific composer placeholder", () => {
    expect(WIRELINE_PAINTER_UI.composerPlaceholder).toMatch(/describe/i);
    expect(WIRELINE_PAINTER_UI.composerPlaceholder.length).toBeGreaterThan(30);
  });

  it("ships both long and short page subtitles for responsive headers", () => {
    expect(WIRELINE_PAINTER_UI.pageSubtitle).toMatch(/prototypes/i);
    expect(WIRELINE_PAINTER_UI.pageSubtitleShort).toMatch(/studio/i);
    expect(WIRELINE_PAINTER_UI.pageSubtitleShort.length).toBeLessThan(10);
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
