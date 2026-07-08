export type AgentDirection = "outbound" | "inbound" | "hybrid";

export const GUIDED_AGENT_LEARNING_LOOP = [
  { step: "Ask", promise: "One focused setup choice at a time." },
  { step: "Teach", promise: "Explain the tradeoff before asking for details." },
  { step: "Capture", promise: "Turn answers into role, script, guardrails, handoff, and outcomes." },
  { step: "Check", promise: "Confirm launch readiness before a real call touches a customer." },
] as const;

export const AGENT_DIRECTION_GUIDANCE: Record<
  AgentDirection,
  {
    label: string;
    shortLabel: string;
    plainEnglish: string;
    bestFor: string;
    loop: readonly [string, string, string, string];
    proofQuestion: string;
  }
> = {
  outbound: {
    label: "Outbound",
    shortLabel: "Makes calls",
    plainEnglish: "Outbound means the agent starts from a list and works toward a defined result.",
    bestFor: "Sales, re-engagement, surveys, billing recovery, scheduling, and negotiation.",
    loop: ["List", "Script", "Dial", "Log"],
    proofQuestion: "Can the agent explain why it is calling and what success looks like?",
  },
  inbound: {
    label: "Inbound",
    shortLabel: "Answers calls",
    plainEnglish:
      "Inbound means the agent answers live calls, classifies intent, resolves approved work, and routes the rest.",
    bestFor: "Front desk, support triage, lead qualification, after-hours coverage, and overflow.",
    loop: ["Route", "Answer", "Resolve", "Log"],
    proofQuestion: "Can the agent identify the caller's need and know when to escalate?",
  },
  hybrid: {
    label: "Hybrid",
    shortLabel: "Does both",
    plainEnglish: "Hybrid means the agent answers inbound calls and also makes approved follow-up calls.",
    bestFor: "Revenue desks, callbacks, appointment desks, renewals, collections, and follow-up operations.",
    loop: ["Answer", "Act", "Follow up", "Sync"],
    proofQuestion:
      "Can the agent switch between answering, acting, following up, and syncing the outcome?",
  },
};

export type CallPlanReadinessInput = {
  purpose: string;
  caller: string;
  outcome: string;
  handoff: string;
  boundaries: string;
};

function isConcrete(value: string, minLength: number) {
  const text = value.trim();
  if (text.length < minLength) return false;
  if (/^describe\b/i.test(text)) return false;
  if (/^(sales|support|book|help|be helpful|ask me|be good)$/i.test(text)) return false;
  return true;
}

export function scoreCallPlanReadiness(input: CallPlanReadinessInput) {
  const purpose = input.purpose.trim();
  const caller = input.caller.trim();
  const outcome = input.outcome.trim();
  const handoff = input.handoff.trim();
  const boundaries = input.boundaries.trim();

  return [
    { id: "role", label: "Role is specific", ready: isConcrete(purpose, 24) },
    { id: "caller", label: "Caller or list is named", ready: isConcrete(caller, 16) },
    { id: "outcome", label: "Success is defined", ready: isConcrete(outcome, 24) },
    { id: "handoff", label: "Human takeover is clear", ready: isConcrete(handoff, 24) },
    { id: "boundaries", label: "Guardrails are explicit", ready: isConcrete(boundaries, 24) },
  ] as const;
}
