/**
 * wireline-agent-objections.test.ts
 * ----------------------------------------------------------------------
 * wireline-agent-objections.ts names this exact file in its header as
 * "regression coverage". It guards the objection-matcher (first-hit by
 * declaration order, phrase vs. word-boundary matching) and the
 * `${var}` renderer that must never leak a literal placeholder to TTS.
 */
import { describe, expect, it } from "vitest";
import {
  WIRELINE_OBJECTIONS,
  DEFAULT_OBJECTION_VARS,
  findObjectionMatch,
  renderObjectionResponse,
  renderPlaybookForSystemPrompt,
  type ObjectionEntry,
} from "./wireline-agent-objections";

describe("findObjectionMatch", () => {
  it("matches each canonical objection by its representative phrase", () => {
    const cases: Array<[string, string]> = [
      ["honestly this is too expensive for us", "too_expensive"],
      ["wait, are you a robot?", "sounds_like_ai"],
      ["i need to think about it", "need_to_think"],
      ["we already use hubspot", "already_have_competitor"],
      ["does it integrate with salesforce", "integration_question"],
      ["is my data secure with you", "data_security"],
      ["what if it makes a mistake on a call", "what_if_mistake"],
    ];
    for (const [utterance, expectedId] of cases) {
      expect(findObjectionMatch(utterance)?.id).toBe(expectedId);
    }
  });

  it("returns null when no pattern matches", () => {
    expect(findObjectionMatch("what time do you open on saturdays")).toBeNull();
  });

  it("uses word-boundary matching for single-word patterns", () => {
    // "insecure" must not trip the single-word "secure" pattern.
    expect(findObjectionMatch("i feel insecure about switching vendors")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(findObjectionMatch("TOO EXPENSIVE")?.id).toBe("too_expensive");
  });

  it("returns the first hit by declaration order", () => {
    // Contains both a too_expensive signal and a need_to_think signal;
    // too_expensive is declared first, so it wins.
    expect(findObjectionMatch("it's too expensive, let me think about it")?.id).toBe(
      "too_expensive",
    );
  });
});

describe("renderObjectionResponse", () => {
  it("substitutes default vars when none are supplied", () => {
    const competitor = WIRELINE_OBJECTIONS.find((o) => o.id === "already_have_competitor")!;
    const out = renderObjectionResponse(competitor);
    expect(out).toContain(DEFAULT_OBJECTION_VARS.competitor);
    expect(out).not.toMatch(/\$\{/);
  });

  it("lets callers override a variable per-call", () => {
    const competitor = WIRELINE_OBJECTIONS.find((o) => o.id === "already_have_competitor")!;
    const out = renderObjectionResponse(competitor, { competitor: "Dialpad" });
    expect(out).toContain("Dialpad");
    expect(out).not.toContain(DEFAULT_OBJECTION_VARS.competitor);
  });

  it("falls back to the bare variable name rather than leaking ${...}", () => {
    const fake: ObjectionEntry = {
      id: "x",
      label: "x",
      objection_pattern: ["x"],
      response_template: "we handle ${unknownvar} cleanly",
      follow_up_question: "?",
      rationale: "",
    };
    const out = renderObjectionResponse(fake);
    expect(out).toBe("we handle unknownvar cleanly");
  });
});

describe("renderPlaybookForSystemPrompt", () => {
  it("emits one line per objection with no leaked placeholders or markdown", () => {
    const prompt = renderPlaybookForSystemPrompt();
    expect(prompt).toContain("OBJECTION HANDLING PLAYBOOK");
    expect(prompt).not.toMatch(/\$\{/);
    for (const o of WIRELINE_OBJECTIONS) {
      expect(prompt).toContain(o.label);
    }
  });
});

describe("playbook integrity", () => {
  it("every entry has a unique id and non-empty patterns", () => {
    const ids = WIRELINE_OBJECTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of WIRELINE_OBJECTIONS) {
      expect(o.objection_pattern.length).toBeGreaterThan(0);
      expect(o.response_template.trim().length).toBeGreaterThan(0);
    }
  });
});
