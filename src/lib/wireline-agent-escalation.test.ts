/**
 * wireline-agent-escalation.test.ts
 * ----------------------------------------------------------------------
 * wireline-agent-escalation.ts names this exact file in its header as
 * "regression coverage". The rule engine decides WHEN a Wireline agent
 * hands a live call to the founder — a silent edit that broke priority
 * ordering or a keyword set would either page Mike on every call or
 * trap an angry caller with the bot. This locks the behavior down.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateEscalation,
  createInitialState,
  getTier1TopicList,
  TIER_1_TOPICS,
  WIRELINE_ESCALATION_RULES,
  SUPPORT_AUTO_REFUND_MAX_USD,
  type ConversationState,
} from "./wireline-agent-escalation";

function state(overrides: Partial<ConversationState> = {}): ConversationState {
  return { ...createInitialState("reception"), ...overrides };
}

describe("default behavior", () => {
  it("createInitialState produces a clean ai_handles baseline", () => {
    const decision = evaluateEscalation(createInitialState("sales"));
    expect(decision.rule_id).toBeNull();
    expect(decision.action).toBe("ai_handles");
    expect(decision.message_to_caller).toBe("");
  });
});

describe("rule ordering + priorities", () => {
  it("rules are uniquely prioritized so ordering is deterministic", () => {
    const priorities = WIRELINE_ESCALATION_RULES.map((r) => r.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it("a legal threat (p10) beats an explicit human request (p20)", () => {
    const decision = evaluateEscalation(
      state({ transcript: "my lawyer says i should speak to a human about this" }),
    );
    expect(decision.rule_id).toBe("legal_threat_or_data_request");
    expect(decision.action).toBe("transfer_to_owner");
  });
});

describe("explicit human request", () => {
  it("fires on a human/supervisor/manager keyword", () => {
    expect(evaluateEscalation(state({ transcript: "get me a human" })).rule_id).toBe(
      "explicit_human_request",
    );
    expect(evaluateEscalation(state({ transcript: "i need your supervisor" })).rule_id).toBe(
      "explicit_human_request",
    );
  });

  it("uses word-boundary matching — 'humanly' does not trip 'human'", () => {
    const decision = evaluateEscalation(state({ transcript: "that seems humanly impossible" }));
    expect(decision.action).toBe("ai_handles");
  });
});

describe("legal / data-deletion threats", () => {
  it("fires and transfers live on regulatory language", () => {
    for (const t of ["delete my data", "i want a gdpr request", "i'll take legal action"]) {
      expect(evaluateEscalation(state({ transcript: t })).rule_id).toBe(
        "legal_threat_or_data_request",
      );
    }
  });
});

describe("repeated misunderstanding", () => {
  it("transfers after 3+ 'I don't understand' turns, not before", () => {
    expect(evaluateEscalation(state({ iDontUnderstandCount: 2 })).action).toBe("ai_handles");
    expect(evaluateEscalation(state({ iDontUnderstandCount: 3 })).rule_id).toBe(
      "repeated_misunderstanding",
    );
  });
});

describe("refund threshold (support persona)", () => {
  it("queues an email review above the auto-issue threshold (no live transfer)", () => {
    const decision = evaluateEscalation(
      state({ persona: "support", requestedRefundAmount: SUPPORT_AUTO_REFUND_MAX_USD + 1 }),
    );
    expect(decision.rule_id).toBe("refund_above_threshold");
    expect(decision.action).toBe("send_email_to_owner");
  });

  it("does not fire at or below the threshold", () => {
    expect(
      evaluateEscalation(
        state({ persona: "support", requestedRefundAmount: SUPPORT_AUTO_REFUND_MAX_USD }),
      ).action,
    ).toBe("ai_handles");
  });

  it("only applies to the support persona", () => {
    expect(
      evaluateEscalation(state({ persona: "sales", requestedRefundAmount: 9999 })).action,
    ).toBe("ai_handles");
  });
});

describe("hot enterprise lead (sales persona)", () => {
  it("pings the owner via SMS on an enterprise signal", () => {
    const decision = evaluateEscalation(
      state({ persona: "sales", transcript: "do you support white label for multi-location?" }),
    );
    expect(decision.rule_id).toBe("hot_enterprise_lead");
    expect(decision.action).toBe("send_sms_to_owner");
  });

  it("ignores enterprise keywords for non-sales personas", () => {
    expect(
      evaluateEscalation(state({ persona: "reception", transcript: "we are an enterprise" }))
        .action,
    ).toBe("ai_handles");
  });
});

describe("sustained frustration", () => {
  it("fires only on two consecutive frustrated turns at the tail", () => {
    expect(
      evaluateEscalation(state({ sentimentHistory: ["frustrated", "frustrated"] })).rule_id,
    ).toBe("sustained_frustration");
  });

  it("does not fire on a single frustrated turn or after recovery", () => {
    expect(evaluateEscalation(state({ sentimentHistory: ["frustrated"] })).action).toBe(
      "ai_handles",
    );
    expect(evaluateEscalation(state({ sentimentHistory: ["frustrated", "neutral"] })).action).toBe(
      "ai_handles",
    );
  });
});

describe("Tier-1 topic list", () => {
  it("getTier1TopicList returns a fresh, mutation-safe copy", () => {
    const a = getTier1TopicList();
    const b = getTier1TopicList();
    expect(a).not.toBe(b);
    expect(a).toEqual([...TIER_1_TOPICS]);
    a.push("mutated");
    expect(getTier1TopicList()).not.toContain("mutated");
  });
});
