import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  clampRuntimePromptPreservingTail,
  wasRuntimePromptTrimmed,
} from "../src/lib/agent-runtime-helpers";

/**
 * A call prompt over its size limit is cut from the end of the owner's
 * content, keeping the fixed safety text. The cut used to land mid-word,
 * could drop what the owner ruled out, and was never recorded.
 */
const SAFETY = "\n\n## ACTION AND RESULT SAFETY\n- Never claim an action without a tool result.";
const LIMITS = "\n\n## LIMITS SET BY THE ACCOUNT HOLDER";
const rule = (index: number) => `Rule ${index}: ${"confirm the detail ".repeat(20)}end.`;

describe("cutting a prompt to fit", () => {
  it("leaves a prompt that fits alone", () => {
    const text = `You are Sam.\n${rule(1)}${SAFETY}`;
    expect(clampRuntimePromptPreservingTail(text, 6_000)).toBe(text);
    expect(wasRuntimePromptTrimmed(text)).toBe(false);
  });

  it("drops whole lines from the end of the owner's content, and says it did", () => {
    const head = Array.from({ length: 40 }, (_, index) => rule(index)).join("\n");
    const cut = clampRuntimePromptPreservingTail(`${head}${SAFETY}`, 6_000);
    expect(cut.length).toBeLessThanOrEqual(6_000);
    expect(wasRuntimePromptTrimmed(cut)).toBe(true);
    const kept = cut.slice(0, cut.indexOf("\n\n[Context trimmed"));
    // The last thing kept is a complete rule, not half a sentence.
    expect(kept.endsWith("end.")).toBe(true);
    expect(kept.startsWith("Rule 0:")).toBe(true);
    expect(cut.endsWith(SAFETY)).toBe(true);
  });

  it("still keeps the start of one long unbroken passage", () => {
    const cut = clampRuntimePromptPreservingTail(`${"x".repeat(9_000)}${SAFETY}`, 6_000);
    expect(cut.startsWith("x".repeat(5_000))).toBe(true);
    expect(cut.endsWith(SAFETY)).toBe(true);
  });

  it("keeps the owner's limits with the safety text when they fit", () => {
    const limits = `${LIMITS}\nDo not discuss:\n- competitor pricing`;
    const head = Array.from({ length: 40 }, (_, index) => rule(index)).join("\n");
    const cut = clampRuntimePromptPreservingTail(`${head}${limits}${SAFETY}`, 6_000);
    expect(cut.length).toBeLessThanOrEqual(6_000);
    expect(cut.endsWith(`${limits}${SAFETY}`)).toBe(true);
  });

  it("shortens the owner's limits from their end rather than lose the opening", () => {
    const opening = `You are Sam.\n${"The fixed opening of the prompt. ".repeat(60)}`;
    const items = Array.from({ length: 80 }, (_, index) => `- limit ${index} ${"z".repeat(90)}`);
    const limits = `${LIMITS}\nNever say, claim, or promise:\n${items.join("\n")}`;
    const cut = clampRuntimePromptPreservingTail(`${opening}${limits}${SAFETY}`, 6_000);
    expect(cut.length).toBeLessThanOrEqual(6_000);
    // The opening is whole, the first limits are kept, the last are not.
    expect(cut.startsWith(opening.trimEnd())).toBe(true);
    expect(cut).toContain("- limit 0 ");
    expect(cut).not.toContain("- limit 79 ");
    // Every kept limit is a whole line.
    const block = cut.slice(cut.indexOf(LIMITS), cut.indexOf(SAFETY));
    for (const line of block.split("\n").filter((entry) => entry.startsWith("- "))) {
      expect(line.endsWith("z".repeat(90))).toBe(true);
    }
    expect(cut.endsWith(SAFETY)).toBe(true);
  });

  it("does not leave a list heading with none of its items", () => {
    const opening = "The fixed opening of the prompt. ".repeat(170);
    const filler = Array.from({ length: 2 }, (_, index) => `- topic ${index} ${"t".repeat(140)}`);
    const limits = `${LIMITS}\nDo not discuss:\n${filler.join("\n")}\nNever say, claim, or promise:\n- ${"n".repeat(400)}`;
    const cut = clampRuntimePromptPreservingTail(`${opening}${limits}${SAFETY}`, 6_000);
    const block = cut.slice(cut.indexOf(LIMITS), cut.indexOf(SAFETY));
    expect(block.trimEnd().endsWith(":")).toBe(false);
  });

  it("is recorded when it happens on a call", () => {
    const runtime = readFileSync("src/lib/voice/openai-phone-agent-runtime.ts", "utf8");
    expect(runtime).toContain("if (wasRuntimePromptTrimmed(instructions)) {");
    expect(runtime).toContain('log.warn("Bot instructions were trimmed to fit a call", {');
  });

  it("cannot be steered by saved template text that imitates a kept heading", () => {
    expect(readFileSync("src/lib/runtime-template-personality.ts", "utf8")).toContain(
      "IMMEDIATE-ESCALATION TRIGGERS|LIMITS SET BY THE ACCOUNT HOLDER|ACTION AND RESULT SAFETY",
    );
  });
});
