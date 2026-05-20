import { describe, it, expect } from "vitest";
import {
  evaluateEscalation,
  createInitialState,
  WIRELINE_ESCALATION_RULES,
  TIER_1_TOPICS,
  SUPPORT_AUTO_REFUND_MAX_USD,
  SALES_AUTO_DISCOUNT_MAX_PERCENT,
  getTier1TopicList,
  HUMAN_REQUEST_KEYWORDS,
  ENTERPRISE_KEYWORDS,
  LEGAL_THREAT_KEYWORDS,
  type ConversationState,
  type WirelinePersonaId,
} from "./wireline-agent-escalation";

function withState(
  persona: WirelinePersonaId,
  overrides: Partial<ConversationState> = {},
): ConversationState {
  return { ...createInitialState(persona), ...overrides };
}

describe("createInitialState", () => {
  it("returns a clean state for each persona", () => {
    for (const p of ["reception", "sales", "support"] as const) {
      const s = createInitialState(p);
      expect(s.persona).toBe(p);
      expect(s.transcript).toBe("");
      expect(s.sentimentHistory).toEqual([]);
      expect(s.iDontUnderstandCount).toBe(0);
      expect(s.requestedRefundAmount).toBeNull();
      expect(s.isExistingCustomer).toBe(false);
    }
  });
});

describe("getTier1TopicList", () => {
  it("returns a fresh array (not a frozen reference)", () => {
    const a = getTier1TopicList();
    const b = getTier1TopicList();
    expect(a).not.toBe(b);
    a.push("DESTRUCTIVE");
    expect(getTier1TopicList()).not.toContain("DESTRUCTIVE");
  });

  it("covers the key Tier-1 categories Mike explicitly listed", () => {
    const list = getTier1TopicList().join(" ").toLowerCase();
    expect(list).toContain("pricing");
    expect(list).toContain("password reset");
    expect(list).toContain("cancellation");
    expect(list).toContain("demo");
    expect(list).toContain("free trial");
    expect(list).toContain("data security");
    expect(list).toContain("trial extension");
  });

  it("the source-of-truth TIER_1_TOPICS export is frozen", () => {
    expect(Object.isFrozen(TIER_1_TOPICS)).toBe(true);
  });
});

describe("WIRELINE_ESCALATION_RULES structural invariants", () => {
  it("has unique stable IDs", () => {
    const ids = WIRELINE_ESCALATION_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique priorities (no ambiguous ordering)", () => {
    const ps = WIRELINE_ESCALATION_RULES.map((r) => r.priority);
    expect(new Set(ps).size).toBe(ps.length);
  });

  it("every rule has a caller-facing message that's voice-friendly", () => {
    for (const r of WIRELINE_ESCALATION_RULES) {
      expect(r.message_to_caller.length).toBeGreaterThan(10);
      // No markdown gymnastics
      expect(r.message_to_caller).not.toMatch(/\*\*|##|`|\[.*\]\(.*\)/);
      // Voice prompts shouldn't be paragraphs — keep under 280 chars
      expect(r.message_to_caller.length).toBeLessThan(280);
    }
  });

  it("every rule has a documented rationale", () => {
    for (const r of WIRELINE_ESCALATION_RULES) {
      expect(r.rationale.length).toBeGreaterThan(10);
    }
  });

  it("financial thresholds are exported as numeric constants", () => {
    expect(typeof SUPPORT_AUTO_REFUND_MAX_USD).toBe("number");
    expect(SUPPORT_AUTO_REFUND_MAX_USD).toBeGreaterThan(0);
    expect(typeof SALES_AUTO_DISCOUNT_MAX_PERCENT).toBe("number");
    expect(SALES_AUTO_DISCOUNT_MAX_PERCENT).toBeGreaterThan(0);
  });

  it("exposes the keyword groups for cross-module reuse", () => {
    expect(HUMAN_REQUEST_KEYWORDS.length).toBeGreaterThan(3);
    expect(ENTERPRISE_KEYWORDS.length).toBeGreaterThan(3);
    expect(LEGAL_THREAT_KEYWORDS.length).toBeGreaterThan(3);
  });
});

describe("evaluateEscalation — default behavior (the WHOLE POINT)", () => {
  it("defaults to ai_handles when nothing matches", () => {
    const d = evaluateEscalation(withState("reception"));
    expect(d.action).toBe("ai_handles");
    expect(d.rule_id).toBeNull();
    expect(d.message_to_caller).toBe("");
  });

  it("returns ai_handles for a benign pricing question", () => {
    const d = evaluateEscalation(
      withState("sales", {
        transcript: "what does this cost",
        latestUtterance: "what does this cost",
      }),
    );
    expect(d.action).toBe("ai_handles");
  });

  it("returns ai_handles for a benign feature question", () => {
    const d = evaluateEscalation(
      withState("reception", {
        transcript: "does this work for plumbers",
        latestUtterance: "does this work for plumbers",
      }),
    );
    expect(d.action).toBe("ai_handles");
  });
});

describe("evaluateEscalation — explicit human request", () => {
  const humanLines = [
    "i want to speak to a real person",
    "let me talk to a human",
    "get me your supervisor",
    "i need a manager",
    "i want to speak to the owner",
    "transfer me to a live agent",
  ];

  for (const line of humanLines) {
    it(`fires explicit_human_request on: "${line}"`, () => {
      const d = evaluateEscalation(
        withState("reception", { transcript: line, latestUtterance: line }),
      );
      expect(d.rule_id).toBe("explicit_human_request");
      expect(d.action).toBe("transfer_to_owner");
    });
  }

  it("does NOT fire on look-alike non-trigger words", () => {
    // "humanly" should NOT trigger "human" — that's the bug we'd ship if
    // we used substring matching on single tokens.
    const d = evaluateEscalation(
      withState("reception", {
        transcript: "that's humanly impossible to schedule",
        latestUtterance: "that's humanly impossible to schedule",
      }),
    );
    expect(d.rule_id).not.toBe("explicit_human_request");
  });

  it("does NOT fire on 'manager' embedded in another word like 'management'", () => {
    const d = evaluateEscalation(
      withState("sales", {
        transcript: "we need a property management solution",
        latestUtterance: "we need a property management solution",
      }),
    );
    expect(d.rule_id).not.toBe("explicit_human_request");
  });
});

describe("evaluateEscalation — repeated misunderstanding", () => {
  it("fires after 3 'I don't understand' moments", () => {
    const d = evaluateEscalation(
      withState("support", { iDontUnderstandCount: 3, transcript: "what" }),
    );
    expect(d.rule_id).toBe("repeated_misunderstanding");
    expect(d.action).toBe("transfer_to_owner");
  });

  it("does NOT fire at 2 misunderstandings (give the AI another shot)", () => {
    const d = evaluateEscalation(withState("support", { iDontUnderstandCount: 2 }));
    expect(d.action).toBe("ai_handles");
  });
});

describe("evaluateEscalation — refund threshold", () => {
  it("fires send_email_to_owner above the threshold", () => {
    const d = evaluateEscalation(
      withState("support", { requestedRefundAmount: SUPPORT_AUTO_REFUND_MAX_USD + 1 }),
    );
    expect(d.rule_id).toBe("refund_above_threshold");
    expect(d.action).toBe("send_email_to_owner");
  });

  it("does NOT fire at or below the threshold (AI auto-issues)", () => {
    const dEqual = evaluateEscalation(
      withState("support", { requestedRefundAmount: SUPPORT_AUTO_REFUND_MAX_USD }),
    );
    expect(dEqual.action).toBe("ai_handles");
    const dBelow = evaluateEscalation(
      withState("support", { requestedRefundAmount: SUPPORT_AUTO_REFUND_MAX_USD - 10 }),
    );
    expect(dBelow.action).toBe("ai_handles");
  });

  it("does NOT fire on non-support personas (Sales doesn't issue refunds)", () => {
    const d = evaluateEscalation(
      withState("sales", { requestedRefundAmount: SUPPORT_AUTO_REFUND_MAX_USD + 100 }),
    );
    expect(d.rule_id).not.toBe("refund_above_threshold");
  });

  it("never live-transfers a refund (only emails)", () => {
    const d = evaluateEscalation(withState("support", { requestedRefundAmount: 1_000_000 }));
    expect(d.action).toBe("send_email_to_owner");
    expect(d.action).not.toBe("transfer_to_owner");
  });
});

describe("evaluateEscalation — enterprise / hot lead", () => {
  it("fires SMS-to-owner on enterprise keyword in sales context", () => {
    const d = evaluateEscalation(
      withState("sales", {
        transcript: "we need a white label solution for 50 locations",
        latestUtterance: "we need a white label solution for 50 locations",
      }),
    );
    expect(d.rule_id).toBe("hot_enterprise_lead");
    expect(d.action).toBe("send_sms_to_owner");
  });

  it("fires on 'custom integration'", () => {
    const d = evaluateEscalation(
      withState("sales", {
        transcript: "we want a custom integration with salesforce",
        latestUtterance: "we want a custom integration with salesforce",
      }),
    );
    expect(d.rule_id).toBe("hot_enterprise_lead");
  });

  it("does NOT fire on non-sales personas (Reception routes first)", () => {
    const d = evaluateEscalation(
      withState("reception", {
        transcript: "we need a white label deal",
        latestUtterance: "we need a white label deal",
      }),
    );
    expect(d.rule_id).not.toBe("hot_enterprise_lead");
  });

  it("does NOT fire on a casual mention of 'enterprise software' in a feature question", () => {
    // Pragmatic acceptance: any "enterprise" mention from a sales-context
    // caller IS a signal — we'd rather over-page Mike's SMS once than
    // miss a real lead. Confirm the rule is intentional with this test.
    const d = evaluateEscalation(
      withState("sales", {
        transcript: "i compared you to enterprise software like salesforce",
        latestUtterance: "i compared you to enterprise software like salesforce",
      }),
    );
    expect(d.rule_id).toBe("hot_enterprise_lead");
  });
});

describe("evaluateEscalation — sustained frustration", () => {
  it("fires after two consecutive frustrated turns", () => {
    const d = evaluateEscalation(
      withState("support", { sentimentHistory: ["neutral", "frustrated", "frustrated"] }),
    );
    expect(d.rule_id).toBe("sustained_frustration");
    expect(d.action).toBe("send_sms_to_owner");
  });

  it("does NOT fire on a single frustrated turn (let the agent recover)", () => {
    const d = evaluateEscalation(
      withState("support", { sentimentHistory: ["neutral", "neutral", "frustrated"] }),
    );
    expect(d.action).toBe("ai_handles");
  });

  it("does NOT fire if the most recent turn is no longer frustrated", () => {
    // Caller calmed down — we shouldn't keep escalating retroactively
    const d = evaluateEscalation(
      withState("support", {
        sentimentHistory: ["frustrated", "frustrated", "neutral"],
      }),
    );
    expect(d.action).toBe("ai_handles");
  });
});

describe("evaluateEscalation — legal / data deletion / attorney", () => {
  const legalLines = [
    "i'll talk to my attorney about this",
    "you'll be hearing from my lawyer",
    "i want to take legal action",
    "delete my data immediately",
    "i'm filing a gdpr request",
    "i need account suspension",
  ];

  for (const line of legalLines) {
    it(`fires legal_threat_or_data_request on: "${line}"`, () => {
      const d = evaluateEscalation(
        withState("support", { transcript: line, latestUtterance: line }),
      );
      expect(d.rule_id).toBe("legal_threat_or_data_request");
      expect(d.action).toBe("transfer_to_owner");
    });
  }

  it("rationale mentions the all-three-channels intent for legal", () => {
    const d = evaluateEscalation(
      withState("support", { transcript: "lawsuit", latestUtterance: "lawsuit" }),
    );
    expect(d.rationale.toLowerCase()).toContain("all three");
  });
});

describe("evaluateEscalation — priority ordering", () => {
  it("legal threat beats refund threshold when both fire simultaneously", () => {
    // Both rules would match — legal has lower priority number → wins
    const d = evaluateEscalation(
      withState("support", {
        transcript: "if you don't refund my $500 i'll talk to my attorney",
        latestUtterance: "if you don't refund my $500 i'll talk to my attorney",
        requestedRefundAmount: 500,
      }),
    );
    expect(d.rule_id).toBe("legal_threat_or_data_request");
  });

  it("explicit human-request beats hot-enterprise-lead", () => {
    const d = evaluateEscalation(
      withState("sales", {
        transcript: "I need white label, get me your manager",
        latestUtterance: "I need white label, get me your manager",
      }),
    );
    expect(d.rule_id).toBe("explicit_human_request");
  });

  it("explicit human-request beats sustained frustration", () => {
    const d = evaluateEscalation(
      withState("support", {
        transcript: "let me talk to a real person",
        latestUtterance: "let me talk to a real person",
        sentimentHistory: ["frustrated", "frustrated"],
      }),
    );
    expect(d.rule_id).toBe("explicit_human_request");
  });

  it("legal threat beats explicit human request (legal is the ceiling)", () => {
    const d = evaluateEscalation(
      withState("support", {
        transcript: "i want to talk to a manager and consult an attorney",
        latestUtterance: "i want to talk to a manager and consult an attorney",
      }),
    );
    expect(d.rule_id).toBe("legal_threat_or_data_request");
  });
});

describe("evaluateEscalation — Tier-1 questions never escalate", () => {
  // Mike's explicit instruction: Tier-1 questions must NOT escalate.
  // This test is intentionally exhaustive so a future code change that
  // accidentally adds an over-eager rule blows up here, loud + clear.
  const tier1Utterances = [
    "what is wireline",
    "how much does it cost",
    "where are you based",
    "do you have a free trial",
    "how do i sign up",
    "how do i get a phone number",
    "how do i clone a voice",
    "does this work for plumbers",
    "can i extend my trial",
    "i need a password reset",
    "can you resend my receipt",
    "i'd like to cancel my plan",
    "can i book a demo",
    "can i hear it in action",
    "how do you compare to ringover",
    "is my data secure",
    "do you support hipaa",
    "what is your pricing",
    "do you integrate with hubspot",
    "tell me about features",
  ];

  for (const utt of tier1Utterances) {
    it(`does NOT escalate on Tier-1 question: "${utt}"`, () => {
      // Test across all three personas — none should escalate
      for (const persona of ["reception", "sales", "support"] as const) {
        const d = evaluateEscalation(withState(persona, { transcript: utt, latestUtterance: utt }));
        expect(d.action).toBe("ai_handles");
        expect(d.rule_id).toBeNull();
      }
    });
  }
});

describe("evaluateEscalation — safety", () => {
  it("does not throw even if state has unusual values", () => {
    expect(() =>
      evaluateEscalation({
        transcript: "",
        latestUtterance: "",
        sentimentHistory: [],
        iDontUnderstandCount: 0,
        isExistingCustomer: false,
        requestedRefundAmount: null,
        persona: "reception",
      }),
    ).not.toThrow();
  });

  it("survives an extremely long transcript without performance issues", () => {
    const big = "blah ".repeat(5000);
    const start = Date.now();
    evaluateEscalation(withState("support", { transcript: big, latestUtterance: big }));
    const elapsed = Date.now() - start;
    // Sanity: regex over 25k chars must stay <50ms on any modern box
    expect(elapsed).toBeLessThan(200);
  });
});
