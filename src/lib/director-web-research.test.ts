import { describe, it, expect } from "vitest";
import {
  wantsDirectorWebResearch,
  buildDirectorResearchQuery,
  appendResearchToUserPrompt,
} from "./director-web-research";

describe("director web research", () => {
  it("detects research-oriented operator messages", () => {
    expect(wantsDirectorWebResearch("What are competitors charging for HVAC in Austin?")).toBe(
      true,
    );
    expect(wantsDirectorWebResearch("Text Jordan back")).toBe(false);
    expect(wantsDirectorWebResearch("Research the latest FDCPA updates for my agency")).toBe(true);
  });

  it("builds a richer query from short follow-ups", () => {
    const q = buildDirectorResearchQuery("what about pricing?", [
      { role: "operator", content: "Compare ServiceTitan vs Housecall Pro" },
    ]);
    expect(q.toLowerCase()).toContain("serviceTitan".toLowerCase());
    expect(q.toLowerCase()).toContain("pricing");
  });

  it("prepends research block to user prompt", () => {
    const out = appendResearchToUserPrompt("Operator: hi", "[LIVE WEB RESEARCH]\nData\n[END]");
    expect(out.startsWith("[LIVE WEB RESEARCH]")).toBe(true);
    expect(out).toContain("Operator: hi");
  });
});
