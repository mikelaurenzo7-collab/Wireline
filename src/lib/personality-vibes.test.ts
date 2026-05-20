// personality-vibes tests — the agent moat lives in this file. If
// buildVibeBlock silently regresses (someone refactors a string,
// drops the NEVER FABRICATE clause, or breaks the always-on adaptive
// core), every showcase demo call goes flat. These tests pin the
// behavior contract: every vibe must include the core directive,
// every output must include the anti-fabrication clause, and the
// shape must be stable across "warm" / "playful" / "authoritative"
// / null / unknown inputs.

import { describe, it, expect } from "vitest";
import { buildVibeBlock, VIBES, type PersonalityVibe } from "./personality-vibes";

describe("VIBES record", () => {
  it("exports exactly the three supported vibes", () => {
    expect(Object.keys(VIBES).sort()).toEqual(["authoritative", "playful", "warm"]);
  });

  it("every vibe has a label, tagline, and directive", () => {
    for (const v of Object.values(VIBES)) {
      expect(typeof v.label).toBe("string");
      expect(v.label.length).toBeGreaterThan(0);
      expect(typeof v.tagline).toBe("string");
      expect(v.tagline.length).toBeGreaterThan(0);
      expect(typeof v.directive).toBe("string");
      // Vibe directives intentionally stay tight — too long and the
      // rest of the system prompt gets diluted. Pin a sane ceiling.
      expect(v.directive.length).toBeGreaterThan(100);
      expect(v.directive.length).toBeLessThan(1500);
    }
  });

  it("each vibe's directive is distinct (no copy-paste between vibes)", () => {
    expect(VIBES.warm.directive).not.toEqual(VIBES.playful.directive);
    expect(VIBES.warm.directive).not.toEqual(VIBES.authoritative.directive);
    expect(VIBES.playful.directive).not.toEqual(VIBES.authoritative.directive);
  });
});

describe("buildVibeBlock — always-on adaptive + quick core", () => {
  const inputs: Array<PersonalityVibe | null | undefined | string> = [
    "warm",
    "playful",
    "authoritative",
    null,
    undefined,
    "",
    "not-a-real-vibe",
  ];

  it.each(inputs.map((i) => [i]))("ships the CORE header for input %o", (input: any) => {
    const out = buildVibeBlock(input);
    expect(out).toContain("## CORE — ADAPTIVE + QUICK");
  });

  it.each(inputs.map((i) => [i]))(
    "ships the NEVER FABRICATE clause for input %o (anti-hallucination moat)",
    (input: any) => {
      const out = buildVibeBlock(input);
      expect(out).toContain("NEVER FABRICATE AN ACTION");
    },
  );

  it.each(inputs.map((i) => [i]))(
    "ships the 'Be adaptive' opener for input %o (style moat)",
    (input: any) => {
      const out = buildVibeBlock(input);
      expect(out).toContain("Be adaptive.");
    },
  );

  it("returns a non-empty block even when vibe is null/undefined", () => {
    expect(buildVibeBlock(null).trim().length).toBeGreaterThan(0);
    expect(buildVibeBlock(undefined).trim().length).toBeGreaterThan(0);
  });
});

describe("buildVibeBlock — per-vibe header injection", () => {
  it("warm output contains the WARM PROFESSIONAL header and directive", () => {
    const out = buildVibeBlock("warm");
    expect(out).toContain("## PERSONALITY VIBE — WARM PROFESSIONAL");
    expect(out).toContain(VIBES.warm.directive);
  });

  it("playful output contains the PLAYFUL & QUIRKY header and directive", () => {
    const out = buildVibeBlock("playful");
    expect(out).toContain("## PERSONALITY VIBE — PLAYFUL & QUIRKY");
    expect(out).toContain(VIBES.playful.directive);
  });

  it("authoritative output contains the AUTHORITATIVE & CRISP header and directive", () => {
    const out = buildVibeBlock("authoritative");
    expect(out).toContain("## PERSONALITY VIBE — AUTHORITATIVE & CRISP");
    expect(out).toContain(VIBES.authoritative.directive);
  });

  it("each vibe's output is strictly longer than the unspecified-vibe output", () => {
    const base = buildVibeBlock(null);
    for (const v of ["warm", "playful", "authoritative"] as PersonalityVibe[]) {
      expect(buildVibeBlock(v).length).toBeGreaterThan(base.length);
    }
  });
});

describe("buildVibeBlock — unknown vibe fallback (graceful)", () => {
  it("unknown vibe string returns only the core (no PERSONALITY VIBE header)", () => {
    const out = buildVibeBlock("not-a-real-vibe");
    expect(out).toContain("## CORE — ADAPTIVE + QUICK");
    expect(out).not.toContain("## PERSONALITY VIBE");
  });

  it("empty string treated like 'no vibe set' (no header injected)", () => {
    const out = buildVibeBlock("");
    expect(out).not.toContain("## PERSONALITY VIBE");
  });

  it("null treated like 'no vibe set' (no header injected)", () => {
    const out = buildVibeBlock(null);
    expect(out).not.toContain("## PERSONALITY VIBE");
  });
});

describe("buildVibeBlock — ordering invariant", () => {
  it("CORE block appears BEFORE the PERSONALITY VIBE block", () => {
    const out = buildVibeBlock("playful");
    const coreAt = out.indexOf("## CORE — ADAPTIVE + QUICK");
    const vibeAt = out.indexOf("## PERSONALITY VIBE");
    expect(coreAt).toBeGreaterThanOrEqual(0);
    expect(vibeAt).toBeGreaterThan(coreAt);
  });
});
