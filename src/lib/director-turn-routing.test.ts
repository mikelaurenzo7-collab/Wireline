import { describe, expect, it } from "vitest";
import { usesDirectorStructuredLlm } from "./director-turn";

describe("usesDirectorStructuredLlm", () => {
  it("uses structured path for fleet and openrouter coach", () => {
    expect(
      usesDirectorStructuredLlm({
        userId: "u1",
        operatorMessage: "hi",
        history: [],
        fleet: [],
        modelSelection: { provider: "wireline", tier: "auto" },
      }),
    ).toBe(true);

    expect(
      usesDirectorStructuredLlm({
        userId: "u1",
        operatorMessage: "hi",
        history: [],
        fleet: [],
        focusAgentId: "agent-1",
        modelSelection: { provider: "openrouter", modelId: "openai/gpt-4o" },
      }),
    ).toBe(true);
  });

  it("uses workspace planner for coach wireline", () => {
    expect(
      usesDirectorStructuredLlm({
        userId: "u1",
        operatorMessage: "hi",
        history: [],
        fleet: [],
        focusAgentId: "agent-1",
        modelSelection: { provider: "wireline", tier: "sonnet" },
      }),
    ).toBe(false);
  });
});
