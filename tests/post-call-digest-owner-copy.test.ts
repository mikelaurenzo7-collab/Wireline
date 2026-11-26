import { describe, expect, it } from "vitest";

import {
  classifyCallOutcome,
  digestDurationLabel,
  digestOutcomeLabel,
  nextActionFromOutcome,
  renderDigestEmail,
  renderDigestEmailText,
} from "../src/lib/post-call-digest";

const baseView = {
  agentName: "Ava",
  customerName: "Sam",
  direction: "inbound",
  durationSeconds: 42,
  summary: "Caller: Do you service water heaters?",
  sentiment: "neutral",
  outcomeTag: "other",
  campaignSource: null,
};

describe("post-call digest owner copy", () => {
  it("names outcomes in plain words instead of internal tags", () => {
    const text = renderDigestEmailText(baseView);
    expect(text).toContain("Call, Ava → Sam");
    expect(text).not.toContain("OTHER");
    expect(digestOutcomeLabel("qualified")).toBe("Interested");
    expect(digestOutcomeLabel("unreachable")).toBe("No conversation");
    expect(digestOutcomeLabel("not-a-tag")).toBe("Call");
  });

  it("shows short calls in seconds, not 0 min", () => {
    expect(digestDurationLabel(42)).toBe("42 sec");
    expect(digestDurationLabel(null)).toBe("0 sec");
    expect(digestDurationLabel(125)).toBe("2 min");
    expect(renderDigestEmailText(baseView)).toContain("inbound · 42 sec");
  });

  it("states sentiment only when a real signal set it", () => {
    // Calls are no longer sentiment-scored; the stored default says nothing.
    expect(renderDigestEmailText(baseView)).not.toContain("sentiment");
    expect(renderDigestEmail(baseView)).not.toContain("sentiment");
    expect(renderDigestEmailText({ ...baseView, sentiment: "positive" })).toContain(
      "· positive sentiment",
    );
  });

  it("drops the CRM status line now that no CRM is connected", () => {
    for (const rendered of [renderDigestEmail(baseView), renderDigestEmailText(baseView)]) {
      expect(rendered).not.toContain("CRM");
    }
  });

  it("speaks to a small business, not a sales floor", () => {
    expect(nextActionFromOutcome("qualified")).toBe(
      "The caller sounded interested. Follow up soon while it's fresh.",
    );
    for (const tag of ["booked", "qualified", "followup", "dnc", "unreachable", "info", "other"]) {
      expect(nextActionFromOutcome(tag)).not.toMatch(/closer|demo|meeting owner/i);
    }
  });
});

describe("interest is not read from a refusal", () => {
  const outcome = (callerText: string) =>
    classifyCallOutcome({
      durationSeconds: 60,
      endedReason: "completed",
      observed: { callerText, appointmentBooked: false },
    });

  it("keeps hedged refusals out of qualified, which would close an outbound lead", () => {
    expect(outcome("I'm not really interested.")).toBe("other");
    expect(outcome("Honestly I'm not that interested right now.")).toBe("other");
    expect(outcome("It's not for me, thanks.")).toBe("other");
    expect(outcome("I'm not interested, thanks.")).toBe("other");
  });

  it("still recognizes genuine interest", () => {
    expect(outcome("Yes, I'm interested in a quote.")).toBe("qualified");
    expect(outcome("We have the budget for this.")).toBe("qualified");
  });
});
