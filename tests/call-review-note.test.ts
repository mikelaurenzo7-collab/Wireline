import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  displayCallReviewNote,
  isLegacyCallReviewFailure,
  presentCallAnalysis,
  presentCallReport,
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

  it("keeps the outcome ledger's review filter while call history shows the new report", () => {
    const calls = readFileSync("src/components/CallLogsClaude.tsx", "utf8");
    const outcomes = readFileSync("src/components/OutcomeLedger.tsx", "utf8");
    expect(outcomes).toContain("displayCallReviewNote(");
    expect(outcomes).toContain("isLegacyCallReviewFailure(");
    expect(calls).toContain("callOutcomeLabel(reportHappened(selected))");
    expect(calls).not.toContain("selected.coaching_note");
    expect(calls).not.toContain("selected.coachingNote");
  });

  it.each(["Ask one question at a time.", "Gemini API key not configured"])(
    "keeps outcome evidence but removes provider ids for review note %s",
    (coachingNote) => {
      const call = {
        id: "call-1",
        vapiCallId: "internal-provider-call",
        coachingNote,
        leadScore: 42,
        intentLabel: "question",
        sentiment: "neutral",
        happened: "email_sent",
        transcript: "Synthetic call evidence",
      };
      const result = presentCallReport(call);
      expect(result).not.toHaveProperty("vapiCallId");
      expect(result).toMatchObject({
        id: "call-1",
        happened: "email_sent",
        transcript: "Synthetic call evidence",
      });
      expect(result.coachingNote).toBe(
        isLegacyCallReviewFailure(coachingNote) ? null : coachingNote,
      );
      expect(call.vapiCallId).toBe("internal-provider-call");
    },
  );

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
      expect(readFileSync(`src/routes/${route}`, "utf8")).toContain("presentCallReport(");
    }
  });

  it("excludes synthetic scores from the retained leaderboard average", () => {
    const source = readFileSync("src/routes/insights-routes.ts", "utf8");
    expect(source).not.toContain('"/api/insights/failure-modes"');
    expect(source).toContain("LEGACY_CALL_REVIEW_FAILURE_NOTES[0]");
    expect(source).toContain("LEGACY_CALL_REVIEW_FAILURE_NOTES[1]");
    expect(source).toContain("btrim(coalesce(${schema.callLogs.coachingNote}, '')) IN");
    const leaderboard = source.slice(source.indexOf('"/api/insights/leaderboard"'));
    expect(leaderboard).toContain("avg(${reviewableLeadScore})");
    expect(source).toContain("ELSE coalesce(${schema.callLogs.leadScore}, 0)");
  });
});
