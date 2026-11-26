import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK as block } from "../src/lib/agent-runtime";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * These rules came from a real founder call on November 25, 2026: the Bot
 * announced "Searching for marketing now", said it had no "verified info",
 * spelled a common name letter by letter, and repeated an email it had just
 * confirmed. The properties are pinned; the wording is free to improve.
 */
describe("how the Bot talks on a live call", () => {
  it("does not narrate its own work or leak internal words", () => {
    expect(block).toMatch(/Never narrate your work/);
    expect(block).toMatch(/searching, checking, looking up/);
    expect(block).toMatch(/knowledge base, or verification/);
  });

  it("admits not knowing in plain words and offers the next step", () => {
    expect(block).toMatch(/If you do not know, say so plainly and offer the next step/);
  });

  it("moves a booking forward and confirms each detail once", () => {
    expect(block).toMatch(/To book, ask for the day and time first/);
    expect(block).toMatch(/Confirm a detail once/);
    expect(block).toMatch(/Do not spell names letter by letter unless asked/);
    expect(block).toMatch(/After a yes, do not repeat it/);
  });

  it("keeps a natural back and forth", () => {
    expect(block).toMatch(/one question at a time/);
    expect(block).toMatch(/Do not open consecutive replies with the same word/);
    expect(block).toMatch(/If the caller is mid-thought, wait/);
  });

  it("stays small, because every live prompt carries it inside a fixed budget", () => {
    // The block is a guardrail the prompt clamp never trims, so growth here
    // comes straight out of the room left for an owner's Training.
    expect(block.length).toBeLessThan(2_600);
    expect(read("src/lib/agent-runtime-helpers.ts")).toMatch(/## VOICE AND DELIVERY CONSISTENCY/);
  });
});
