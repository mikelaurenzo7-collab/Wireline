import { describe, expect, it } from "vitest";

import {
  PRIVATE_AGENT_TEST_TOOL,
  buildPrivateAgentTestUserMessage,
} from "./private-agent-test";

describe("private agent rehearsal", () => {
  it("keeps the customer-test tool reply-only and closed", () => {
    expect(PRIVATE_AGENT_TEST_TOOL.name).toBe("customer_test_reply");
    expect(PRIVATE_AGENT_TEST_TOOL.input_schema.additionalProperties).toBe(false);
    expect(PRIVATE_AGENT_TEST_TOOL.input_schema.required).toEqual(["reply"]);
  });

  it("formats a private rehearsal transcript without claiming a live call", () => {
    const user = buildPrivateAgentTestUserMessage("Desk", "Can you quote a price?", [
      { role: "customer", content: "Hi" },
      { role: "employee", content: "How can I help?" },
    ]);
    expect(user).toContain("Customer: Hi");
    expect(user).toContain("Desk: How can I help?");
    expect(user).toContain("Customer: Can you quote a price?");
    expect(user).not.toContain("live call");
  });
});
