import { describe, expect, it } from "vitest";
import {
  clampRuntimePrompt,
  MAX_RUNTIME_PROMPT_CHARS,
  MAX_RUNTIME_SNIPPET_CHARS,
  sanitizePhone,
  timingSafeEq,
  truncateRuntimeSnippet,
} from "./vapi-helpers";

// These helpers back the Vapi webhook auth path (timingSafeEq), outbound
// dialing (sanitizePhone), and the latency-bounded voice prompt assembly
// (truncate/clamp). They are security- and cost-sensitive, so their
// behaviour is locked here.

describe("timingSafeEq", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEq("super-secret-token", "super-secret-token")).toBe(true);
  });

  it("returns false for different same-length strings", () => {
    expect(timingSafeEq("aaaaaaaa", "aaaaaaab")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEq("short", "a-much-longer-secret")).toBe(false);
    expect(timingSafeEq("", "x")).toBe(false);
  });

  it("treats empty vs empty as equal (route guards unset-secret separately)", () => {
    expect(timingSafeEq("", "")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(timingSafeEq("Secret", "secret")).toBe(false);
  });
});

describe("sanitizePhone", () => {
  it("strips formatting characters and keeps digits and plus", () => {
    expect(sanitizePhone("+1 (630) 642-5661")).toBe("+16306425661");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(sanitizePhone(null)).toBe("");
    expect(sanitizePhone(undefined)).toBe("");
    expect(sanitizePhone("")).toBe("");
  });

  it("removes letters and other injection characters", () => {
    expect(sanitizePhone("+1-630-CALL; DROP")).toBe("+1630");
  });

  it("caps length at 20 characters to bound abuse", () => {
    const out = sanitizePhone("+" + "9".repeat(50));
    expect(out.length).toBe(20);
    expect(out.startsWith("+9")).toBe(true);
  });
});

describe("truncateRuntimeSnippet", () => {
  it("returns trimmed text unchanged when within limit", () => {
    expect(truncateRuntimeSnippet("  hello  ")).toBe("hello");
  });

  it("truncates and appends an ellipsis when over the limit", () => {
    const long = "x".repeat(MAX_RUNTIME_SNIPPET_CHARS + 50);
    const out = truncateRuntimeSnippet(long);
    expect(out.length).toBe(MAX_RUNTIME_SNIPPET_CHARS + 1); // + ellipsis char
    expect(out.endsWith("…")).toBe(true);
  });

  it("honours a custom max", () => {
    expect(truncateRuntimeSnippet("abcdef", 3)).toBe("abc…");
  });
});

describe("clampRuntimePrompt", () => {
  it("returns the prompt unchanged when within limit", () => {
    const prompt = "system prompt body";
    expect(clampRuntimePrompt(prompt)).toBe(prompt);
  });

  it("clamps oversized prompts and appends the trim notice", () => {
    const oversized = "y".repeat(MAX_RUNTIME_PROMPT_CHARS + 1000);
    const out = clampRuntimePrompt(oversized);
    expect(out.startsWith("y".repeat(MAX_RUNTIME_PROMPT_CHARS))).toBe(true);
    expect(out).toContain("[Context trimmed for voice latency");
  });
});
