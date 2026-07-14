import { describe, expect, it } from "vitest";

import {
  AGENT_TEST_MAX_PROMPT_CHARS,
  AGENT_TEST_MAX_SYSTEM_CHARS,
  AGENT_TEST_MAX_USER_CHARS,
  buildBoundedAgentTestPrompt,
} from "../src/lib/agent-test-prompt";

describe("bounded agent test prompt", () => {
  it("never exceeds the deterministic system, user, or total budgets", () => {
    const prompt = buildBoundedAgentTestPrompt({
      systemSections: Array.from(
        { length: 100 },
        (_, index) => `Section ${index}: ${"business fact ".repeat(600)}`,
      ),
      history: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 ? ("employee" as const) : ("customer" as const),
        content: `turn-${index} ${"detail ".repeat(900)}`,
      })),
      customerMessage: `current-request ${"now ".repeat(2_000)}`,
      employeeName: "Avery",
    });

    expect(prompt.system.length).toBeLessThanOrEqual(AGENT_TEST_MAX_SYSTEM_CHARS);
    expect(prompt.user.length).toBeLessThanOrEqual(AGENT_TEST_MAX_USER_CHARS);
    expect(prompt.totalChars).toBeLessThanOrEqual(AGENT_TEST_MAX_PROMPT_CHARS);
    expect(prompt.user).toContain("current-request");
  });

  it("keeps newest history and drops oldest history first", () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? ("employee" as const) : ("customer" as const),
      content: `turn-${index} ${"context ".repeat(260)}`,
    }));
    const prompt = buildBoundedAgentTestPrompt({
      systemSections: ["Core instructions"],
      history,
      customerMessage: "What can you do for me today?",
      employeeName: "Avery",
    });

    expect(prompt.user).toContain("turn-11");
    expect(prompt.user).not.toContain("turn-0 ");
    expect(prompt.includedHistoryMessages).toBeLessThan(history.length);
  });

  it("returns the same prompt for the same input", () => {
    const input = {
      systemSections: ["Identity", null, "Rules"],
      history: [{ role: "customer" as const, content: "Do you work weekends?" }],
      customerMessage: "Can I book Saturday?",
      employeeName: "Avery",
    };

    expect(buildBoundedAgentTestPrompt(input)).toEqual(buildBoundedAgentTestPrompt(input));
  });
});
