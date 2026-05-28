/**
 * personality-vibes.test.ts
 * ----------------------------------------------------------------------
 * Tests for the agent moat. Personality vibes + the always-on adaptive
 * core directive are THE thing competitors can't credibly copy — every
 * voice AI in 2026 ships flat corporate bots, and this file is what
 * stops Wireline from accidentally regressing into the same.
 *
 * Snapshot tests intentionally NOT used: we want explicit, readable
 * assertions about what every directive contains, so a future edit
 * that deletes the "never fabricate an action" rule fails loudly with
 * a clear message rather than silently re-generating a snapshot.
 */
import { describe, expect, it } from "vitest";
import { VIBES, buildVibeBlock, type PersonalityVibe } from "./personality-vibes";

describe("VIBES catalog", () => {
  it("ships exactly three vibes", () => {
    const keys = Object.keys(VIBES);
    expect(keys.sort()).toEqual(["authoritative", "playful", "warm"]);
  });

  it.each(["warm", "playful", "authoritative"] as const)(
    "%s has label, tagline, and non-trivial directive",
    (key: PersonalityVibe) => {
      const v = VIBES[key];
      expect(v.label.length).toBeGreaterThan(3);
      expect(v.tagline.length).toBeGreaterThan(10);
      // Directives should be substantial paragraphs, not one-liners.
      expect(v.directive.length).toBeGreaterThan(200);
    },
  );

  describe("vibe directives encode their intent", () => {
    it("warm reads as a trustworthy receptionist default", () => {
      const d = VIBES.warm.directive;
      // The directive forbids "as an AI" — it explicitly names the
      // phrase to ban, then encodes a positive replacement.
      expect(d).toMatch(/never use the words "as an AI"/i);
      expect(d).toMatch(/warm|smile|confident/i);
      expect(d).toMatch(/human handoff|offer a next step/i);
    });

    it("playful earns wit through capability — never the other way", () => {
      const d = VIBES.playful.directive;
      // The "capability earns the right to wit" line is the brand thesis.
      expect(d).toMatch(/capability earns the right to wit/i);
      // It stays a fixed, light personality — it sets quips aside when
      // things get serious WITHOUT flipping into a different voice.
      expect(d).toMatch(/playful/i);
      expect(d).toMatch(/set the quips aside|same friendly voice/i);
      // It must NOT instruct the agent to switch personality mid-call.
      expect(d).not.toMatch(/read the room/i);
      expect(d).not.toMatch(/drop the playfulness/i);
    });

    it("authoritative is formal + crisp, no slang, with compliance gravity", () => {
      const d = VIBES.authoritative.directive;
      expect(d).toMatch(/formal|precise/i);
      expect(d).toMatch(/no.*(jokes|slang|filler)/i);
      expect(d).toMatch(/compliance/i);
    });
  });
});

describe("buildVibeBlock", () => {
  it("always emits the adaptive-core directive (the moat ships even without a vibe)", () => {
    const out = buildVibeBlock(null);
    expect(out).toMatch(/CORE — ADAPTIVE \+ QUICK/);
    expect(out).toMatch(/Be adaptive/);
    expect(out).toMatch(/NEVER FABRICATE AN ACTION/);
  });

  it("includes both adaptive core AND the operator-selected vibe when set", () => {
    const out = buildVibeBlock("playful");
    expect(out).toMatch(/CORE — ADAPTIVE \+ QUICK/);
    expect(out).toMatch(/PERSONALITY VIBE — PLAYFUL & QUIRKY/);
    expect(out).toMatch(/witty|playful|quip/i);
  });

  it.each(["warm", "playful", "authoritative"] as const)(
    "renders the %s vibe header in uppercase",
    (key: PersonalityVibe) => {
      const out = buildVibeBlock(key);
      expect(out).toContain(`PERSONALITY VIBE — ${VIBES[key].label.toUpperCase()}`);
    },
  );

  it("falls back to adaptive-core only when given an unknown vibe id", () => {
    const out = buildVibeBlock("snarky-pirate" as unknown as string);
    expect(out).toMatch(/CORE — ADAPTIVE \+ QUICK/);
    expect(out).not.toMatch(/PERSONALITY VIBE/);
  });

  it("encodes the 'never fabricate an action' guardrail explicitly", () => {
    const out = buildVibeBlock("warm");
    expect(out).toMatch(/NEVER FABRICATE AN ACTION/);
    expect(out).toMatch(/tool/i);
    expect(out).toMatch(/follow up/i);
  });

  it("encodes the no-filler rule that makes Wireline agents feel fast", () => {
    const out = buildVibeBlock("warm");
    // The exact phrase from the directive — guard against silent edits.
    expect(out).toMatch(/No filler/);
    expect(out).toMatch(/um|let me check|one moment please/i);
  });

  it("locks personality, voice, and cadence — no mid-call tone switching", () => {
    // The core fear: agents lurching between registers to match the
    // caller. This guards the always-on rule that forbids it.
    const out = buildVibeBlock("warm");
    expect(out).toMatch(/personality, voice, and cadence are fixed/i);
    expect(out).toMatch(/Do NOT mirror the caller's tone/i);
  });
});
