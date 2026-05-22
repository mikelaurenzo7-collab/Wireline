import { describe, it, expect } from "vitest";
import {
  MAX_RUNTIME_PROMPT_CHARS,
  MAX_RUNTIME_SNIPPET_CHARS,
  clampRuntimePrompt,
  truncateRuntimeSnippet,
} from "./vapi-helpers";

describe("runtime prompt budget helpers", () => {
  it("truncates long snippets with ellipsis", () => {
    const out = truncateRuntimeSnippet("a".repeat(MAX_RUNTIME_SNIPPET_CHARS + 40));
    expect(out.length).toBe(MAX_RUNTIME_SNIPPET_CHARS + 1);
    expect(out.endsWith("…")).toBe(true);
  });

  it("clamps full system prompts with operator-facing trim notice", () => {
    const out = clampRuntimePrompt("b".repeat(MAX_RUNTIME_PROMPT_CHARS + 1000));
    expect(out.length).toBeLessThanOrEqual(MAX_RUNTIME_PROMPT_CHARS + 120);
    expect(out).toContain("Context trimmed for voice latency");
  });
});
