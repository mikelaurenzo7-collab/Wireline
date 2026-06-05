import { describe, it, expect } from "vitest";
import { buildCreativeDirectorTurn, isCreativeIntent } from "./director-creative-turn";

describe("director creative turn", () => {
  it("detects logo / brand creative intents", () => {
    expect(isCreativeIntent("Design a logo for my startup")).toBe(true);
    expect(isCreativeIntent("Generate a hero image for our homepage")).toBe(true);
    expect(isCreativeIntent("How is my fleet doing?")).toBe(false);
  });

  it("returns clarifying questions when brief is incomplete", () => {
    const out = buildCreativeDirectorTurn("Create a logo for Acme", []);
    expect(out.clarifyingQuestions.length).toBeGreaterThan(0);
    expect(out.reply.toLowerCase()).toContain("before i generate");
  });
});
