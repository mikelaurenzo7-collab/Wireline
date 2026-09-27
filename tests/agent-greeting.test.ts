import { describe, expect, it } from "vitest";
import { resolveAgentGreeting } from "../src/lib/agent-greeting";

describe("effective Bot greeting", () => {
  it("uses the saved Studio override before a creation-time greeting", () => {
    expect(
      resolveAgentGreeting({ name: "Jordan", firstMessage: "Old greeting" }, [
        { content: "Never invent availability." },
        { content: "Opening greeting: Welcome to the front desk." },
      ]),
    ).toBe("Welcome to the front desk.");
  });

  it("uses the current first message after an override is removed", () => {
    expect(resolveAgentGreeting({ name: "Jordan", firstMessage: " New greeting " }, [])).toBe(
      "New greeting",
    );
  });

  it("restores the same safe default when all custom greetings are cleared", () => {
    expect(resolveAgentGreeting({ name: "Jordan", firstMessage: null }, [])).toBe(
      "Hi, this is Jordan. How can I help?",
    );
    expect(resolveAgentGreeting({}, [{ content: "Opening greeting: " }])).toBe(
      "Hi, this is your Bot. How can I help?",
    );
  });
});
