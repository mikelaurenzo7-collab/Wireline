import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseAgentPlaybook,
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
