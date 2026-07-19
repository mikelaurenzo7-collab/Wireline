/**
 * Wireline platform-internal agent escalation engine.
 *
 * This module governs WHEN our own customer-facing AI agents (Wireline
 * Reception, Wireline Sales, Wireline Support) escalate to a human —
 * specifically the platform owner (Mike). It is intentionally a typed,
 * declarative ruleset so the answers to "why did this transfer happen?"
 * are auditable + testable, not buried in prompt text.
 *
 * Design principles:
 *   1. DEFAULT IS `ai_handles`. We do not bother Mike on ambiguity. The
 *      whole point of running our product on our product is that the AI
 *      resolves calls. Escalation must be earned.
 *   2. RULES ARE ORDERED BY PRIORITY (lower number = more important).
 *      A caller saying "I want a human" beats a sentiment-driven rule
 *      every time.
 *   3. ESCALATION HAS THREE FLAVORS:
 *        - transfer_to_owner   (live transfer to Mike's cell, immediate)
 *        - send_sms_to_owner   (async ping — Mike calls back when free)
 *        - send_email_to_owner (queued for next-day batch review)
 *      Choosing the right one is the rule author's job — not a
 *      universal "transfer everything" reflex.
 *   4. EACH RULE OWNS THE CALLER-FACING LINE the agent says before
 *      escalating. Voice-first means the message must read well aloud
 *      (short, no punctuation gymnastics, contractions OK).
 *
 * This file pairs with:
 *   - wireline-agent-personas.ts (which rule-set each persona uses)
 *   - wireline-agent-objections.ts (handled BEFORE escalation triggers)
 *   - wireline-agent-escalation.test.ts (regression coverage)
 */

/** Sentiment label as detected by Vapi's per-turn analysis. */
export type Sentiment = "positive" | "neutral" | "negative" | "frustrated";

/**
 * Conversation state we evaluate rules against. Populated by the runtime
 * (typically from the Vapi message stream) and passed to every rule's
 * trigger function. Keep this surface small + serializable so rules can
 * be replayed against historical transcripts for backtesting.
 */
export interface ConversationState {
  /** Concatenation of every user utterance so far (lowercased). */
  transcript: string;
  /** Most recent caller utterance (lowercased). */
  latestUtterance: string;
  /** Per-turn sentiment labels in chronological order. */
  sentimentHistory: Sentiment[];
  /** How many times the caller has said any variant of "I don't understand". */
  iDontUnderstandCount: number;
  /** Set if the agent has identified the caller as an existing customer. */
  isExistingCustomer: boolean;
  /**
   * For support flows — refund amount the caller has explicitly requested,
   * if any. NULL when no refund has been discussed.
   */
  requestedRefundAmount: number | null;
  /** Persona being used for the call. */
  persona: WirelinePersonaId;
}

/**
 * The 6 Wireline staff roles. These are the founder's "employees" —
 * the agents that answer Wireline's own lines + that Mike manages
 * from the Founder's Dashboard.
 */
export type WirelinePersonaId =
  | "reception"
  | "sales"
  | "support"
  | "technical"
  | "onboarding"
  | "success";

export type EscalationAction =
  | "transfer_to_owner"
  | "send_sms_to_owner"
  | "send_email_to_owner"
  | "ai_handles";

export interface EscalationRule {
  /** Stable identifier — referenced in tests + analytics. */
  id: string;
  /** Lower number = evaluated first. Ties broken by declaration order. */
  priority: number;
  /** Pure predicate over state — must not mutate anything. */
  trigger: (state: ConversationState) => boolean;
  /** What we DO when the rule fires. */
  action: EscalationAction;
  /**
   * What the agent says to the caller before the action runs. Voice-
   * optimized: short sentences, contractions, no markdown.
   */
  message_to_caller: string;
  /** Plain-English reason for analytics/debug. Not spoken. */
  rationale: string;
}

/**
 * The decision returned by `evaluateEscalation`. Even when no rule
 * fires we return a typed shape so the caller can log the "we handled
 * this" path uniformly.
 */
export interface EscalationDecision {
  rule_id: string | null;
  action: EscalationAction;
  message_to_caller: string;
  rationale: string;
}

/**
 * The Tier-1 "AI handles, no escalation" knowledge baseline. The LLM is
 * given this list in its system prompt so it knows what it has authority
 * to answer alone. NOT consulted by the rule engine directly — the rule
 * engine only decides escalation. The list exists for visibility:
 * if a question is on this list and the agent escalated anyway, that's
 * a bug.
 */
export const TIER_1_TOPICS: readonly string[] = Object.freeze([
  "pricing for any plan",
  "feature questions answerable from documentation",
  "how to sign up",
  "how to get a phone number",
  "how to clone a voice",
  "vertical fit questions (does this work for [industry])",
  "Free Builder tier questions (build/test one agent free, no card, no time limit)",
  "password reset link",
  "receipt or invoice resend",
  "cancellation (confirms + emails Mike a record — no live transfer)",
  "demo booking via Calendly",
  "showcase audio trigger ('can I hear it')",
  "competitor comparison (factual, no disparagement)",
  "data security questions (SOC 2 in progress, HIPAA mode, encryption)",
  "what Wireline is + what problem it solves",
  "where we're based",
  "do we have a free trial",
  "how much does it cost",
]);

/**
 * Discount authority granted to the Sales persona. Annual-commit first-
 * time customers can be offered up to 10% off without escalation — this
 * lets Sales close deals without paging Mike for every price negotiation.
 * Anything above triggers the standard "let me have our founder reach
 * out" hot-lead path.
 */
export const SALES_AUTO_DISCOUNT_MAX_PERCENT = 10;

/**
 * Refund authority granted to the Support persona. Refunds at or below
 * this threshold are issued automatically; above it triggers the queued
 * email review path (NOT a live transfer — Mike batches these).
 */
export const SUPPORT_AUTO_REFUND_MAX_USD = 50;

/**
 * Keyword sets used by multiple rules. Pulled out so we can exhaustively
 * test pattern coverage in one place + reuse in the objections layer
 * without duplication.
 */
export const HUMAN_REQUEST_KEYWORDS = Object.freeze([
  "supervisor",
  "manager",
  "human",
  "real person",
  "owner",
  "speak to a person",
  "talk to a person",
  "live agent",
] as const);

export const ENTERPRISE_KEYWORDS = Object.freeze([
  "enterprise",
  "white label",
  "white-label",
  "whitelabel",
  "multi-location",
  "multiple locations",
  "ten plus agents",
  "10 plus agents",
  "10+ agents",
  "more than 10 agents",
  "custom integration",
  "custom integrations",
] as const);

export const LEGAL_THREAT_KEYWORDS = Object.freeze([
  "attorney",
  "lawyer",
  "lawsuit",
  "sue you",
  "legal action",
  "data deletion",
  "delete my data",
  "delete all my data",
  "gdpr request",
  "ccpa request",
  "account suspension",
  "suspend my account",
] as const);

function containsAny(haystack: string, needles: readonly string[]): boolean {
  // Word-boundary-ish matching: we lowercase + check substring. Phrases
  // ("real person") are matched as substrings; single tokens ("human")
  // are matched with surrounding non-word context to avoid "humanly" or
  // "supermanager" false positives. Pragmatic compromise — full NLP
  // would be overkill for a hand-curated keyword set.
  for (const n of needles) {
    const lower = n.toLowerCase();
    if (lower.includes(" ") || lower.includes("-") || lower.includes("+")) {
      if (haystack.includes(lower)) return true;
    } else {
      // single word — require a non-letter on either side OR end of string
      const re = new RegExp(`(^|[^a-z])${lower}([^a-z]|$)`);
      if (re.test(haystack)) return true;
    }
  }
  return false;
}

/**
 * The canonical Wireline rule set. ORDER MATTERS — lower priority wins.
 * Priorities are spaced by 10s so we have room to insert new rules
 * without renumbering the world.
 */
export const WIRELINE_ESCALATION_RULES: readonly EscalationRule[] = Object.freeze([
  // --- 10s: legal / safety / explicit-human ---------------------------
  {
    id: "legal_threat_or_data_request",
    priority: 10,
    trigger: (s) => containsAny(s.transcript, LEGAL_THREAT_KEYWORDS),
    action: "transfer_to_owner",
    // Legal / data-deletion / suspension are the ONE case where we go
    // all-three (transfer + sms + email). The rule itself emits
    // transfer_to_owner; the runtime layer reads the rationale and
    // mirrors the alert to the other channels.
    message_to_caller:
      "I hear you, and I want to get this exactly right. Let me connect you straight to our founder so he can handle this personally.",
    rationale:
      "Legal/regulatory keyword detected. Transfer live, mirror to SMS + email (all three channels) per the escalation matrix.",
  },
  {
    id: "explicit_human_request",
    priority: 20,
    trigger: (s) => containsAny(s.transcript, HUMAN_REQUEST_KEYWORDS),
    action: "transfer_to_owner",
    message_to_caller: "Absolutely. Let me get a human on the line for you right now — one moment.",
    rationale: "Caller explicitly asked for a human/supervisor/manager.",
  },
  {
    id: "repeated_misunderstanding",
    priority: 30,
    trigger: (s) => s.iDontUnderstandCount >= 3,
    action: "transfer_to_owner",
    message_to_caller:
      "I'm sorry I'm not catching this. Let me get a human on the line who can help you faster.",
    rationale: "Caller said 'I don't understand' 3+ times — we're not landing.",
  },

  // --- 40s: financial-threshold escalations ---------------------------
  {
    id: "refund_above_threshold",
    priority: 40,
    trigger: (s) =>
      s.persona === "support" &&
      s.requestedRefundAmount !== null &&
      s.requestedRefundAmount > SUPPORT_AUTO_REFUND_MAX_USD,
    action: "send_email_to_owner",
    // Critically: NOT a live transfer. We capture the reason + commit to
    // a 24-hour follow-up. Mike processes these in batch overnight so a
    // refund request never wakes him up.
    message_to_caller:
      "Got it. I'll have our team review this and follow up within 24 hours — you'll hear back from us at the number you called from.",
    rationale: `Refund request above auto-issue threshold ($${SUPPORT_AUTO_REFUND_MAX_USD}). Queue for Mike's batch review — no live transfer.`,
  },

  // --- 50s: prospect-quality signals ----------------------------------
  {
    id: "hot_enterprise_lead",
    priority: 50,
    trigger: (s) => s.persona === "sales" && containsAny(s.transcript, ENTERPRISE_KEYWORDS),
    action: "send_sms_to_owner",
    message_to_caller:
      "This sounds like exactly the kind of conversation our founder Mike loves. Let me have him call you back in about ten minutes — he handles all enterprise inquiries personally.",
    rationale: "Enterprise-tier signal detected on a sales call — Mike wants the warm handoff.",
  },

  // --- 60s: emotional-state escalations -------------------------------
  {
    id: "sustained_frustration",
    priority: 60,
    trigger: (s) => {
      // 2+ consecutive frustrated turns at the END of the conversation.
      // We don't fire on a single frustrated turn (could be venting that
      // we recover from); we also don't fire if recovery has happened
      // since (most recent turn must still be frustrated).
      const h = s.sentimentHistory;
      if (h.length < 2) return false;
      const last = h[h.length - 1];
      const prev = h[h.length - 2];
      return last === "frustrated" && prev === "frustrated";
    },
    action: "send_sms_to_owner",
    message_to_caller:
      "I can tell this hasn't been smooth, and I'm sorry. Let me have our founder personally call you back so we get this right. He'll reach out within the hour.",
    rationale: "Two consecutive frustrated turns detected. Empathy + Mike callback.",
  },
]);

/**
 * Evaluate every rule against the current state, pick the lowest-priority
 * rule whose trigger fires, and return its decision. If nothing fires,
 * return the default `ai_handles` decision — the agent owns the call.
 *
 * Pure function. No I/O. No throwing. Safe to call on every turn.
 */
export function evaluateEscalation(state: ConversationState): EscalationDecision {
  const sorted = [...WIRELINE_ESCALATION_RULES].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    let fired = false;
    try {
      fired = rule.trigger(state);
    } catch {
      // Defensive: a buggy trigger must not crash the call. Log via
      // returning a no-op decision is overkill — we just skip the rule.
      fired = false;
    }
    if (fired) {
      return {
        rule_id: rule.id,
        action: rule.action,
        message_to_caller: rule.message_to_caller,
        rationale: rule.rationale,
      };
    }
  }
  return {
    rule_id: null,
    action: "ai_handles",
    message_to_caller: "",
    rationale: "No escalation rule matched — AI handles directly.",
  };
}

/**
 * Convenience: build a fresh, empty-state object. Tests + the runtime
 * layer both use this so the default field values stay in sync.
 */
export function createInitialState(persona: WirelinePersonaId): ConversationState {
  return {
    transcript: "",
    latestUtterance: "",
    sentimentHistory: [],
    iDontUnderstandCount: 0,
    isExistingCustomer: false,
    requestedRefundAmount: null,
    persona,
  };
}

/**
 * Internal export — used by the persona module to give each persona's
 * system prompt the explicit "you handle these without escalating" list.
 * Returning a fresh array on each call so callers can't mutate the
 * frozen module-level list.
 */
export function getTier1TopicList(): string[] {
  return [...TIER_1_TOPICS];
}
