import { describe, expect, it } from "vitest";
import { computeQaStats } from "../src/lib/qa-stats";

describe("qa-stats", () => {
  it("exports computeQaStats for the QA insights tab", () => {
    expect(typeof computeQaStats).toBe("function");
  });
});
