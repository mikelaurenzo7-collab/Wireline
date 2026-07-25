/**
 * Wireline agent objection-handling playbook.
 *
 * A registry of the most common sales/support objections our customer-
 * facing AI agents hear, mapped to canonical responses + a follow-up
 * question that keeps the conversation moving. Used in two places:
 *
 *   1. The persona system prompt (so the LLM has the right framing
 *      pre-loaded as guidance, not a script to read verbatim).
 *   2. Optional runtime matching — when the post-call analysis spots
 *      an objection the agent fumbled, we can replay the canonical
 *      response into the lessons-learned loop.
 *
 * Each entry is small + composable:
 *   - objection_pattern: a list of keyword/phrase needles (case-
 *     insensitive substring match). Multi-word phrases match as-is;
 *     single words use word-boundary matching to avoid "expensive"
 *     hitting "inexpensive".
 *   - response_template: the agent's canonical reply. Voice-friendly,
 *     uses contractions, no markdown, under ~28 words.
 *   - follow_up_question: a single question that re-opens the
 *     conversation after the response. Keeps the AI in discovery
 *     mode instead of dead-ending.
 *
 * The response_template MAY contain `${variable}` placeholders. The
 * `renderObjectionResponse` helper substitutes a `vars` dict.
 *
 * This file pairs with:
 *   - wireline-agent-personas.ts (which references the playbook in
 *     each persona's system prompt)
 *   - wireline-agent-objections.test.ts (regression coverage)
 */

export interface ObjectionEntry {
  /** Stable identifier — referenced in tests + analytics. */
  id: string;
  /** Human-readable label for Account Holder dashboards. */
  label: string;
  /** Lowercased substrings/phrases that signal this objection. */
  objection_pattern: readonly string[];
  /**
   * The agent's response. May contain `${var}` placeholders, substituted
   * at render time. Voice-friendly — short, contractions, no markdown.
   */
  response_template: string;
  /** A question the agent asks after responding, to re-open dialogue. */
  follow_up_question: string;
  /** Free-text rationale — why this response is the canonical one. */
  rationale: string;
}

/**
 * Default variable substitutions. Callers can override per-call (e.g.
 * pull the prospect's competitor name from CRM context) by passing a
 * `vars` map to `renderObjectionResponse`.
 */
export const DEFAULT_OBJECTION_VARS: Record<string, string> = Object.freeze({
  competitor: "your current setup",
  tool: "your existing tools",
  vertical: "your industry",
  monthly_cost: "what you're paying now",
});

export const WIRELINE_OBJECTIONS: readonly ObjectionEntry[] = Object.freeze([
  {
    id: "too_expensive",
    label: "Too expensive",
    objection_pattern: [
      "too expensive",
      "too much",
      "can't afford",
      "cant afford",
      "out of my budget",
      "out of budget",
      "price is high",
      "way too pricey",
      "pricey",
    ],
    response_template:
      "I get it — the price tag stands out. But compare it to a part-time receptionist at twenty hours a week or an answering service charging per minute. We're typically a third of either, and we never call out sick.",
    follow_up_question:
      "What are you spending right now on call handling, roughly — and can I pencil out where you'd land with us?",
    rationale:
      "Grounded comparison vs. true alternatives (human FTE + answering services). No discount-leading — Sales has 10% authority if they need to use it later.",
  },
  {
    id: "sounds_like_ai",
    label: "Will it sound like an AI",
    objection_pattern: [
      "sound like ai",
      "sound robotic",
      "sound fake",
      "sound like a robot",
      "sound like a machine",
      "is this a real person",
      "are you a bot",
      "are you a robot",
      "are you ai",
      "are you a real person",
      "is this ai",
    ],
    response_template:
      "Honest answer — yes, it's AI, but it's the best AI voice on the planet right now. Most callers don't realize until we tell them. Want me to have a demo agent call your phone in thirty seconds so you can hear it?",
    follow_up_question: "What's the best number for a quick demo call — same one you're on?",
    rationale:
      "Honesty disarms. Hard-pivot to experience: hearing the voice in <30s is the single highest-conversion moment in our sales funnel.",
  },
  {
    id: "need_to_think",
    label: "I need to think about it",
    objection_pattern: [
      "need to think",
      "let me think",
      "think about it",
      "have to think",
      "got to think",
      "i'll think",
      "ill think",
      "sleep on it",
      "circle back",
      "get back to you",
    ],
    response_template:
      "Totally fair. Usually when folks want to think it over, there's one specific thing on their mind — pricing, switching cost, or whether it'll actually work for their setup. Which one is closest for you?",
    follow_up_question:
      "And in the meantime — want me to set you up with a free agent, no card needed, so you can build and test it instead of imagining it?",
    rationale:
      "Surfaces the real blocker (almost never 'thinking' — it's a specific concern) and offers the lowest-friction next step (a free, no-card agent build).",
  },
  {
    id: "already_have_competitor",
    label: "I already have [Competitor]",
    objection_pattern: [
      "already have",
      "already use",
      "already using",
      "we use",
      "we have",
      "currently use",
      "we're with",
      "switched from",
      "using ringover",
      "using dialpad",
      "using openphone",
      "using grasshopper",
      "using goto",
    ],
    response_template:
      "Smart — you're not flying blind. Quick question though: what's the one thing about ${competitor} that bugs you the most? Usually that's where we shine, and if it's not, I'll tell you straight up.",
    follow_up_question: "What's the part of your current setup you wish worked differently?",
    rationale:
      "Doesn't trash the competitor. Asks for their grievance — answer reveals fit. Honest-broker positioning ('I'll tell you straight up') builds trust faster than a feature sheet.",
  },
  {
    id: "integration_question",
    label: "Does it integrate with [Tool]",
    objection_pattern: [
      "integrate with",
      "integration with",
      "connect to",
      "connects to",
      "work with",
      "compatible with",
      "plug into",
      "play with",
      "sync with",
    ],
    response_template:
      "Great question. We connect to most CRMs and calendars natively — HubSpot, Salesforce, Calendly, Google Workspace, Zapier covers anything else. Tell me the specific ${tool} and I'll confirm in one second.",
    follow_up_question: "Which tool are you most worried about losing in the move?",
    rationale:
      "Confident positive framing + concrete name-drops (avoids vague 'yes we integrate'). Asks for the specific tool so we don't promise something we don't have.",
  },
  {
    id: "data_security",
    label: "Is my data secure",
    objection_pattern: [
      "data secure",
      "is it secure",
      "secure",
      "data privacy",
      "privacy",
      "is my data safe",
      "data safe",
      "hipaa",
      "gdpr",
      "soc 2",
      "soc2",
      "compliance",
      "encryption",
      "encrypted",
    ],
    response_template:
      "Good question. Encryption in transit and at rest, SOC 2 Type 2 in progress, HIPAA mode available for medical and dental customers. We never train models on your call data, period.",
    follow_up_question:
      "Are you in a vertical with specific compliance requirements I should walk you through?",
    rationale:
      "Honest about SOC 2 being in-progress (don't lie about audits), strong on operational specifics (encryption, no training). Invites the compliance conversation rather than dodging.",
  },
  {
    id: "what_if_mistake",
    label: "What if it makes a mistake",
    objection_pattern: [
      "what if it makes a mistake",
      "make a mistake",
      "makes a mistake",
      "make mistakes",
      "what if it screws up",
      "screw up",
      "what if it gets it wrong",
      "gets it wrong",
      "what if it fails",
      "what if it messes up",
      "messes up",
    ],
    response_template:
      "Honest answer — it'll happen occasionally. The safety net is built in: any time the AI isn't confident, it transfers to a human. Every call is recorded and transcribed, so you see exactly what was said.",
    follow_up_question: "Want me to show you the live transfer flow and call review in Studio?",
    rationale:
      "Don't oversell. Lead with humility, then pivot to the safety net (graceful escalation + observability). Invites a product walkthrough.",
  },
]);

/**
 * Render a response template by substituting `${var}` placeholders.
 * Unmatched placeholders fall back to DEFAULT_OBJECTION_VARS, then to
 * the literal placeholder name (so we never ship a literal "${...}" to
 * the caller — worst case we say "your industry" instead of crashing).
 */
export function renderObjectionResponse(
  entry: ObjectionEntry,
  vars: Record<string, string> = {},
): string {
  const merged = { ...DEFAULT_OBJECTION_VARS, ...vars };
  return entry.response_template.replace(/\$\{(\w+)\}/g, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(merged, name)) {
      return merged[name];
    }
    return name; // last-resort fallback — never leak ${...} to TTS
  });
}

/**
 * Match an utterance against the playbook. Returns the FIRST matching
 * entry (by declaration order) or null. We do not return all matches —
 * the agent only delivers one response at a time, and the playbook is
 * curated so the first hit is the best hit.
 */
export function findObjectionMatch(utterance: string): ObjectionEntry | null {
  const lower = utterance.toLowerCase();
  for (const entry of WIRELINE_OBJECTIONS) {
    for (const pattern of entry.objection_pattern) {
      const p = pattern.toLowerCase();
      if (p.includes(" ") || p.includes("-")) {
        // multi-word phrase: substring match
        if (lower.includes(p)) return entry;
      } else {
        // single word: word-boundary match to avoid "inexpensive" hitting "expensive"
        const re = new RegExp(`(^|[^a-z])${p}([^a-z]|$)`);
        if (re.test(lower)) return entry;
      }
    }
  }
  return null;
}

/**
 * Render the entire playbook as a prompt-injectable string. Used by
 * the persona module to embed the playbook into the system prompt.
 * Voice-friendly: no markdown, terse format the LLM can parse + paraphrase.
 */
export function renderPlaybookForSystemPrompt(): string {
  const lines: string[] = [];
  lines.push("OBJECTION HANDLING PLAYBOOK — paraphrase, don't read verbatim:");
  for (const o of WIRELINE_OBJECTIONS) {
    lines.push(`- ${o.label}: ${renderObjectionResponse(o)} Follow-up: ${o.follow_up_question}`);
  }
  return lines.join("\n");
}
