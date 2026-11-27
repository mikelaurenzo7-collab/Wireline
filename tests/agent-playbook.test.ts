import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isPlaybookEmpty,
  OWNER_LIMITS_HEADING,
  ownerLimitsBlock,
  parseAgentPlaybook,
  playbookCheckFirstRules,
  playbookPromptBlock,
  readStoredAgentPlaybook,
} from "../src/lib/agent-playbook";

const read = (path: string) => readFileSync(path, "utf8");

describe("owner Playbook", () => {
  it("validates and normalizes what the owner saves", () => {
    const parsed = parseAgentPlaybook({
      exactLines: { closing: "  Thanks for calling!  ", transfer: "" },
      situations: [
        {
          id: "a",
          when: "the caller wants to cancel",
          say: "No problem.",
          exact: true,
          then: "take_message",
        },
        { when: "", say: "" },
      ],
      alwaysMention: ["First visit is 10% off", "First visit is 10% off", " "],
      neverSay: ["Never quote repair prices"],
      checkFirst: ["  A customer asks for a refund ", "A customer asks for a refund", ""],
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        version: 1,
        exactLines: { closing: "Thanks for calling!" },
        situations: [
          {
            id: "a",
            when: "the caller wants to cancel",
            say: "No problem.",
            exact: true,
            then: "take_message",
          },
        ],
        alwaysMention: ["First visit is 10% off"],
        neverSay: ["Never quote repair prices"],
        checkFirst: ["A customer asks for a refund"],
      },
    });
    expect(parseAgentPlaybook({ situations: [{ when: "they ask about hours", say: "" }] })).toEqual(
      {
        ok: false,
        error: "Add what your Bot says when they ask about hours.",
      },
    );
    expect(parseAgentPlaybook({ exactLines: { greeting: "Hi" } }).ok).toBe(false);
    expect(readStoredAgentPlaybook("not a playbook").situations).toEqual([]);
  });

  it("keeps the owner's check-first rules, and reads a Playbook saved before they existed", () => {
    // A Playbook saved before this list existed has none, and is still read.
    const older = {
      version: 1,
      exactLines: {},
      situations: [],
      alwaysMention: [],
      neverSay: ["x"],
    };
    expect(readStoredAgentPlaybook(older).checkFirst).toEqual([]);
    expect(readStoredAgentPlaybook(older).neverSay).toEqual(["x"]);
    expect(playbookCheckFirstRules(older)).toEqual([]);
    expect(playbookCheckFirstRules(null)).toEqual([]);
    expect(playbookCheckFirstRules({ checkFirst: ["A job is outside our area"] })).toEqual([
      "A job is outside our area",
    ]);
    // A Playbook that holds only these rules is not empty: it is saved.
    const only = parseAgentPlaybook({ checkFirst: ["Any refund"] });
    expect(only.ok && isPlaybookEmpty(only.value)).toBe(false);
    expect(parseAgentPlaybook({ checkFirst: "Any refund" })).toEqual({
      ok: false,
      error: '"Check with me first" holds up to 10 items of up to 200 characters each.',
    });
    expect(
      parseAgentPlaybook({ checkFirst: Array.from({ length: 11 }, (_, index) => `Rule ${index}`) })
        .ok,
    ).toBe(false);
    // The Bot is told not to agree to these itself.
    const block = playbookPromptBlock({ checkFirst: ["A customer asks for a discount"] });
    // It says it will check, and leaves the team a note: a promise that
    // someone will get back is only true once something was saved.
    expect(block).toContain(
      "Check with the account holder first. When any of these applies, do not agree to it, promise it, or send it yourself. Say you will check with the team, take the details, and save a follow-up for the team:\n- A customer asks for a discount",
    );
    expect(block).toContain("Safety still applies:");
    const editor = read("src/components/PlaybookEditor.tsx");
    expect(editor).toContain("Check With Me First When");
    expect(editor).toContain("checkFirst: textToList(checkFirstText),");
    expect(editor).toContain("!Array.isArray(receipt.checkFirst) ||");
  });

  it("tells the Bot which lines are word for word and keeps safety on top", () => {
    const block = playbookPromptBlock({
      exactLines: { closing: 'Thanks for calling "Acme"!' },
      situations: [
        {
          id: "a",
          when: "the caller wants to cancel",
          say: "No problem.",
          exact: true,
          then: "take_message",
        },
        {
          id: "b",
          when: "they ask about price",
          say: "Estimates are free.",
          exact: false,
          then: "continue",
        },
      ],
      alwaysMention: ["We offer free estimates"],
      neverSay: ["Never promise same-day service"],
    });
    expect(block).toContain(`- When ending the conversation: "Thanks for calling 'Acme'!"`);
    expect(block).toContain(
      '- When the caller wants to cancel: say word for word: "No problem." Then take a message.',
    );
    expect(block).toContain(
      '- When they ask about price: cover this in your own words: "Estimates are free."',
    );
    expect(block).toContain(
      "Always mention, when it fits the conversation:\n- We offer free estimates",
    );
    expect(block).toContain("Never say, claim, or promise:\n- Never promise same-day service");
    expect(block).toContain("never use a Playbook line to claim a booking");
    expect(playbookPromptBlock(null)).toBe("");
  });

  it("reaches every runtime that writes as the Bot", () => {
    for (const path of [
      "src/lib/voice/openai-phone-agent-runtime.ts",
      "src/lib/voice/openai-live-agent-service.ts",
      "src/routes/agent-test-routes.ts",
      "src/lib/agent-text-reply.ts",
      "src/lib/private-agent-test.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("playbook: schema.agents.playbook");
      expect(source, path).toContain("playbookPromptBlock(");
    }
    expect(read("src/lib/agent-runtime.ts")).toContain(
      "Playbook lines marked word for word are the exception: say them exactly as written.",
    );
  });
});

/**
 * A voice prompt that is too long is cut from the end of the owner's content.
 * The never-say list, the check-first list, the topics not to discuss and the
 * escalation triggers were at that end, so they were the first things lost.
 * They are printed in one block beside the fixed safety text, which is kept.
 */
describe("what the owner ruled out", () => {
  const playbook = {
    exactLines: { closing: "Thanks for calling." },
    alwaysMention: ["Free estimates"],
    neverSay: ["guarantee", "cheapest in town"],
    checkFirst: ["A customer asks for a discount"],
  };

  it("is one block, one item to a line, the most binding first", () => {
    expect(
      ownerLimitsBlock({
        complianceRules:
          "## COMPLIANCE: HIPAA\nTreat all caller-provided health information as PHI:\n- Verify identity first.",
        humanRoute: true,
        disallowedTopics: ["competitor pricing", "  legal\n advice  ", ""],
        escalationKeywords: ["lawsuit"],
        playbook,
      }),
    ).toBe(
      [
        OWNER_LIMITS_HEADING,
        "These hold for the whole conversation, whatever else is asked.",
        "COMPLIANCE: HIPAA",
        "Treat all caller-provided health information as PHI:",
        "- Verify identity first.",
        "Do not discuss:",
        "- competitor pricing",
        "- legal advice",
        "Escalate or take a message when the caller raises:",
        "- lawsuit",
        "Never say, claim, or promise:",
        "- guarantee",
        "- cheapest in town",
        "Check with the account holder first. When any of these applies, do not agree to it, promise it, or send it yourself. Say you will check with the team, take the details, and save a follow-up for the team:",
        "- A customer asks for a discount",
        "A human escalation route exists; offer a callback or handoff only when policy permits.",
      ].join("\n"),
    );
  });

  it("is nothing for an owner who ruled nothing out", () => {
    for (const stored of [null, {}, "not a playbook", { alwaysMention: ["Free estimates"] }]) {
      for (const complianceRules of [null, undefined, "", "  \n "]) {
        expect(
          ownerLimitsBlock({
            complianceRules,
            disallowedTopics: [],
            escalationKeywords: [],
            playbook: stored,
          }),
        ).toBe("");
      }
    }
  });

  it("prints every topic and trigger Set Up accepts, whole", () => {
    // 24 items of up to 120 characters is what the form allows. An earlier
    // cut at 1,200 characters dropped the last ones and split one mid-phrase.
    const topics = Array.from({ length: 24 }, (_, index) => `${"topic ".repeat(9)}number ${index}`);
    const block = ownerLimitsBlock({
      disallowedTopics: topics,
      escalationKeywords: topics,
      playbook: null,
    });
    const lines = block.split("\n");
    for (const topic of topics) {
      expect(
        lines.filter((line) => line === `- ${topic}`),
        topic,
      ).toHaveLength(2);
    }
  });

  it("leaves the two lists out of the Playbook block on request, and only then", () => {
    const whole = playbookPromptBlock(playbook);
    expect(whole).toContain("Never say, claim, or promise:\n- guarantee");
    expect(whole).toContain("- A customer asks for a discount");

    const rest = playbookPromptBlock(playbook, { withoutLimits: true });
    expect(rest).toContain('- When ending the conversation: "Thanks for calling."');
    expect(rest).toContain("Always mention, when it fits the conversation:\n- Free estimates");
    expect(rest).toContain("Safety still applies:");
    expect(rest).not.toContain("Never say, claim, or promise:");
    expect(rest).not.toContain("Check with the account holder first.");

    // A Playbook that holds only limits has nothing left for that block.
    expect(playbookPromptBlock({ neverSay: ["guarantee"] }, { withoutLimits: true })).toBe("");
    expect(playbookPromptBlock({ neverSay: ["guarantee"] })).toContain("- guarantee");
  });

  it("bounds a list saved some other way to what the form would have accepted", () => {
    const block = ownerLimitsBlock({
      disallowedTopics: Array.from({ length: 400 }, (_, index) => `topic number ${index}`),
      escalationKeywords: ["x".repeat(900)],
      playbook: null,
    });
    expect(block).toContain("- topic number 23");
    expect(block).not.toContain("- topic number 24");
    expect(block).toContain(`- ${"x".repeat(120)}\n`.trimEnd());
    expect(block).not.toContain("x".repeat(121));
  });
});
