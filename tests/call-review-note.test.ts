import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  displayCallReviewNote,
  isLegacyCallReviewFailure,
  presentCallAnalysis,
} from "../src/lib/call-review-note";

describe("legacy post-call review notes", () => {
  it("hides exact provider-failure markers while retaining genuine review notes", () => {
    expect(isLegacyCallReviewFailure(" Gemini API key not configured ")).toBe(true);
    expect(isLegacyCallReviewFailure("Analysis failed")).toBe(true);
    expect(displayCallReviewNote(" Gemini API key not configured ")).toBeNull();
    expect(displayCallReviewNote("Analysis failed")).toBeNull();
    expect(displayCallReviewNote("  Ask one question at a time.  ")).toBe(
      "Ask one question at a time.",
    );
    expect(displayCallReviewNote("Analysis failed to flag the caller's urgency.")).toBe(
      "Analysis failed to flag the caller's urgency.",
    );
  });

  it("is applied to both call history and the outcome ledger", () => {
    const calls = readFileSync("src/components/CallLogsClaude.tsx", "utf8");
    const outcomes = readFileSync("src/components/OutcomeLedger.tsx", "utf8");
    for (const source of [calls, outcomes]) {
      expect(source).toContain("displayCallReviewNote(");
      expect(source).toContain("isLegacyCallReviewFailure(");
    }
  });

  it("omits fabricated enrichment at the shared API presentation boundary", () => {
    const legacy = {
      id: "call-1",
      coachingNote: "Gemini API key not configured",
      leadScore: 0,
      intentLabel: "unknown",
      sentiment: "neutral",
      qaScore: 92,
      outcomeTag: "completed",
    };
    expect(presentCallAnalysis(legacy)).toEqual({
      ...legacy,
      coachingNote: null,
      leadScore: null,
      intentLabel: null,
      sentiment: null,
    });
    expect(legacy.coachingNote).toBe("Gemini API key not configured");
    expect(presentCallAnalysis({ ...legacy, coachingNote: "Ask more questions." })).toEqual({
      ...legacy,
      coachingNote: "Ask more questions.",
    });
    for (const route of ["agent-call-routes.ts", "dashboard-routes.ts"]) {
      expect(readFileSync(`src/routes/${route}`, "utf8")).toContain("presentCallAnalysis(");
    }
  });

  it("excludes synthetic scores from failure modes and insight averages", () => {
    const source = readFileSync("src/routes/insights-routes.ts", "utf8");
    const failureModes = source.slice(source.indexOf('"/api/insights/failure-modes"'));
    expect(failureModes).toContain("LEGACY_CALL_REVIEW_FAILURE_NOTES[0]");
    expect(failureModes).toContain("LEGACY_CALL_REVIEW_FAILURE_NOTES[1]");
    expect(failureModes).toContain("btrim(coalesce(${schema.callLogs.coachingNote}, '')) NOT IN");
    expect(source.match(/avg\(\$\{reviewableLeadScore\}\)/g)).toHaveLength(2);
    expect(source).toContain("ELSE coalesce(${schema.callLogs.leadScore}, 0)");
  });
});
