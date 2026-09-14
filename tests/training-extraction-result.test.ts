import { describe, expect, it } from "vitest";
import { trainingExtractionWasSaved } from "../src/lib/training-extraction-result";

describe("training extraction confirmation", () => {
  it.each([
    { rules: 1, facts: 0, tone: false },
    { rules: 0, facts: 2, tone: false },
    { rules: 0, facts: 0, tone: true },
  ])("accepts a useful saved result: %j", (readiness) => {
    expect(trainingExtractionWasSaved({ success: true, readiness })).toBe(true);
  });

  it.each([
    null,
    {},
    { success: true },
    { success: false, readiness: { rules: 1 } },
    { success: true, readiness: { rules: 0, facts: 0, tone: false } },
    { success: true, readiness: { rules: -1, facts: NaN, tone: "true" } },
    { success: true, readiness: { rules: "1", facts: Infinity } },
  ])("does not certify missing, empty, or malformed evidence: %j", (result) => {
    expect(trainingExtractionWasSaved(result)).toBe(false);
  });
});
