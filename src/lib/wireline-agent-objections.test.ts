import { describe, it, expect } from "vitest";
import {
  WIRELINE_OBJECTIONS,
  DEFAULT_OBJECTION_VARS,
  findObjectionMatch,
  renderObjectionResponse,
  renderPlaybookForSystemPrompt,
  type ObjectionEntry,
} from "./wireline-agent-objections";

function byId(id: string): ObjectionEntry {
  const entry = WIRELINE_OBJECTIONS.find((o) => o.id === id);
  if (!entry) throw new Error(`Test setup error: no objection with id ${id}`);
  return entry;
}

describe("WIRELINE_OBJECTIONS — structural invariants", () => {
  it("has unique stable IDs", () => {
    const ids = WIRELINE_OBJECTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every objection has a label, pattern list, response, follow-up, and rationale", () => {
    for (const o of WIRELINE_OBJECTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.objection_pattern.length).toBeGreaterThan(0);
      expect(o.response_template.length).toBeGreaterThan(20);
      expect(o.follow_up_question.length).toBeGreaterThan(5);
      expect(o.rationale.length).toBeGreaterThan(20);
    }
  });

  it("every response template is voice-friendly (no markdown)", () => {
    for (const o of WIRELINE_OBJECTIONS) {
      expect(o.response_template).not.toMatch(/\*\*|##|^- |\[.*\]\(.*\)|`/);
      // Voice prompts should not exceed ~350 chars / ~60 words
      expect(o.response_template.length).toBeLessThan(360);
    }
  });

  it("every follow-up is a question (ends with ?)", () => {
    for (const o of WIRELINE_OBJECTIONS) {
      expect(o.follow_up_question.trim().endsWith("?")).toBe(true);
    }
  });

  it("covers the seven Mike-specified objection categories", () => {
    const ids = WIRELINE_OBJECTIONS.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "too_expensive",
        "sounds_like_ai",
        "need_to_think",
        "already_have_competitor",
        "integration_question",
        "data_security",
        "what_if_mistake",
      ]),
    );
  });
});

describe("findObjectionMatch — too_expensive", () => {
  const variants = [
    "this is way too expensive",
    "honestly that's too much for us",
    "I can't afford that right now",
    "it's out of my budget",
    "the price is high for what we need",
    "way too pricey",
  ];
  for (const v of variants) {
    it(`matches: "${v}"`, () => {
      expect(findObjectionMatch(v)?.id).toBe("too_expensive");
    });
  }

  it("does NOT match decoy: 'this is inexpensive'", () => {
    // "expensive" must not hit on "inexpensive" — bug we'd ship with naive substring matching
    const m = findObjectionMatch("this is inexpensive compared to what we used");
    expect(m?.id).not.toBe("too_expensive");
  });

  it("does NOT match decoy: 'we have budget for this'", () => {
    expect(findObjectionMatch("we have budget for this")?.id).not.toBe("too_expensive");
  });
});

describe("findObjectionMatch — sounds_like_ai", () => {
  const variants = [
    "will it sound like ai",
    "I don't want it to sound robotic",
    "is this a real person",
    "are you a bot",
    "are you ai or a real person",
  ];
  for (const v of variants) {
    it(`matches: "${v}"`, () => {
      expect(findObjectionMatch(v)?.id).toBe("sounds_like_ai");
    });
  }

  it("does NOT match decoy: 'we want this to sound professional'", () => {
    expect(findObjectionMatch("we want this to sound professional")?.id).not.toBe("sounds_like_ai");
  });
});

describe("findObjectionMatch — need_to_think", () => {
  const variants = [
    "let me think about it",
    "i need to think on this",
    "I'll think it over",
    "I have to sleep on it",
    "let me circle back",
    "I'll get back to you",
  ];
  for (const v of variants) {
    it(`matches: "${v}"`, () => {
      expect(findObjectionMatch(v)?.id).toBe("need_to_think");
    });
  }

  it("does NOT match decoy: 'I think this is great'", () => {
    expect(findObjectionMatch("I think this is great")?.id).not.toBe("need_to_think");
  });
});

describe("findObjectionMatch — already_have_competitor", () => {
  const variants = [
    "we already use ringover",
    "we already have a phone system",
    "we currently use dialpad",
    "we're with openphone right now",
  ];
  for (const v of variants) {
    it(`matches: "${v}"`, () => {
      expect(findObjectionMatch(v)?.id).toBe("already_have_competitor");
    });
  }

  it("does NOT match decoy: 'we use the phone every day'", () => {
    // "use" alone wouldn't match, only "we use" or "already use" — decoy
    const m = findObjectionMatch("we like to call our customers daily");
    expect(m?.id).not.toBe("already_have_competitor");
  });
});

describe("findObjectionMatch — integration_question", () => {
  const variants = [
    "does it integrate with hubspot",
    "can it connect to salesforce",
    "does this work with my crm",
    "is it compatible with our existing tools",
    "can I plug into google calendar",
  ];
  for (const v of variants) {
    it(`matches: "${v}"`, () => {
      expect(findObjectionMatch(v)?.id).toBe("integration_question");
    });
  }

  it("does NOT match the phrase 'work hard' (decoy on 'work with')", () => {
    expect(findObjectionMatch("we work hard every day")?.id).not.toBe("integration_question");
  });
});

describe("findObjectionMatch — data_security", () => {
  const variants = [
    "is my data secure",
    "is this hipaa compliant",
    "do you have soc 2",
    "what about data privacy",
    "is my data safe",
    "is everything encrypted",
  ];
  for (const v of variants) {
    it(`matches: "${v}"`, () => {
      expect(findObjectionMatch(v)?.id).toBe("data_security");
    });
  }

  it("does NOT match decoy: 'i love the music'", () => {
    expect(findObjectionMatch("i love the music")).toBeNull();
  });
});

describe("findObjectionMatch — what_if_mistake", () => {
  const variants = [
    "what if it makes a mistake",
    "what if it screws up a call",
    "what if it gets it wrong",
    "what if the AI messes up an appointment",
  ];
  for (const v of variants) {
    it(`matches: "${v}"`, () => {
      expect(findObjectionMatch(v)?.id).toBe("what_if_mistake");
    });
  }
});

describe("findObjectionMatch — no false positives across categories", () => {
  it("returns null on a totally benign utterance", () => {
    expect(findObjectionMatch("how are you today")).toBeNull();
  });

  it("returns null on a pricing question (not an objection)", () => {
    // "how much" is a question, not an "it's too expensive" objection
    expect(findObjectionMatch("how much does it cost")).toBeNull();
  });

  it("returns null on case-only difference of common words", () => {
    expect(findObjectionMatch("HELLO THERE")).toBeNull();
  });
});

describe("renderObjectionResponse — variable substitution", () => {
  it("substitutes a known variable from defaults", () => {
    const entry = byId("already_have_competitor");
    const rendered = renderObjectionResponse(entry);
    expect(rendered).toContain(DEFAULT_OBJECTION_VARS.competitor);
    expect(rendered).not.toContain("${competitor}");
  });

  it("substitutes a caller-supplied override", () => {
    const entry = byId("already_have_competitor");
    const rendered = renderObjectionResponse(entry, { competitor: "RingCentral" });
    expect(rendered).toContain("RingCentral");
    expect(rendered).not.toContain("${competitor}");
  });

  it("substitutes the ${tool} placeholder", () => {
    const entry = byId("integration_question");
    const rendered = renderObjectionResponse(entry, { tool: "Pipedrive" });
    expect(rendered).toContain("Pipedrive");
  });

  it("falls back to the placeholder name rather than leaking ${} syntax", () => {
    // Synthesize a one-off entry with an unknown placeholder so we don't
    // pollute the prod registry just to exercise the fallback path.
    const fakeEntry: ObjectionEntry = {
      id: "synthetic",
      label: "synthetic",
      objection_pattern: ["synthetic"],
      response_template: "this uses ${unmappedvar}",
      follow_up_question: "ok?",
      rationale: "test only",
    };
    const rendered = renderObjectionResponse(fakeEntry);
    expect(rendered).not.toContain("${");
    expect(rendered).toBe("this uses unmappedvar");
  });

  it("does not leak ${...} syntax on ANY default render", () => {
    for (const o of WIRELINE_OBJECTIONS) {
      const rendered = renderObjectionResponse(o);
      expect(rendered).not.toMatch(/\$\{/);
    }
  });
});

describe("renderPlaybookForSystemPrompt", () => {
  it("renders a single string with every objection's label", () => {
    const playbook = renderPlaybookForSystemPrompt();
    for (const o of WIRELINE_OBJECTIONS) {
      expect(playbook).toContain(o.label);
    }
  });

  it("does not contain unsubstituted variables", () => {
    expect(renderPlaybookForSystemPrompt()).not.toMatch(/\$\{/);
  });

  it("is below a reasonable prompt-injection size budget", () => {
    // System prompt budget is precious — playbook block under 4kb
    expect(renderPlaybookForSystemPrompt().length).toBeLessThan(4_000);
  });

  it("renders deterministically across calls", () => {
    expect(renderPlaybookForSystemPrompt()).toBe(renderPlaybookForSystemPrompt());
  });
});

describe("DEFAULT_OBJECTION_VARS", () => {
  it("is frozen so callers can't accidentally mutate the defaults", () => {
    expect(Object.isFrozen(DEFAULT_OBJECTION_VARS)).toBe(true);
  });

  it("provides safe-sounding fallbacks for every placeholder used in the registry", () => {
    const placeholdersUsed = new Set<string>();
    for (const o of WIRELINE_OBJECTIONS) {
      const matches = o.response_template.match(/\$\{(\w+)\}/g);
      if (matches) {
        for (const m of matches) {
          const name = m.slice(2, -1);
          placeholdersUsed.add(name);
        }
      }
    }
    for (const name of placeholdersUsed) {
      expect(DEFAULT_OBJECTION_VARS[name]).toBeTruthy();
    }
  });
});
