import { describe, expect, it } from "vitest";
import { classifyCallOutcome } from "../src/lib/post-call-digest";
import {
  ALL_SALES_CALL_FIXTURES,
  GOLDEN_SALES_CALL_FIXTURES,
  RED_TEAM_SALES_CALL_FIXTURES,
} from "../src/lib/sales-call-fixtures";

describe("sales call fixtures contract", () => {
  it("defines five golden and five red-team fixtures", () => {
    expect(GOLDEN_SALES_CALL_FIXTURES).toHaveLength(5);
    expect(RED_TEAM_SALES_CALL_FIXTURES).toHaveLength(5);
    expect(ALL_SALES_CALL_FIXTURES).toHaveLength(10);
  });

  it("classifies golden fixtures to expected productive outcomes", () => {
    for (const fixture of GOLDEN_SALES_CALL_FIXTURES) {
      const outcome = classifyCallOutcome({
        summary: fixture.summary,
        durationSeconds: fixture.durationSeconds,
        endedReason: fixture.endedReason,
      });
      expect(outcome, fixture.id).toBe(fixture.expectedOutcome);
    }
  });

  it("classifies red-team fixtures to expected compliance outcomes", () => {
    for (const fixture of RED_TEAM_SALES_CALL_FIXTURES) {
      if (fixture.id === "redteam-after-hours") {
        expect(fixture.complianceNote).toContain("Calling-hour");
        continue;
      }
      const outcome = classifyCallOutcome({
        summary: fixture.summary,
        transcript: fixture.transcript,
        durationSeconds: fixture.durationSeconds,
        endedReason: fixture.endedReason,
      });
      expect(outcome, fixture.id).toBe(fixture.expectedOutcome);
    }
  });

  it("anchors every golden fixture to a proposed approval action", () => {
    for (const fixture of GOLDEN_SALES_CALL_FIXTURES) {
      expect(fixture.expectedProposedAction, fixture.id).toBeTruthy();
    }
  });
});
