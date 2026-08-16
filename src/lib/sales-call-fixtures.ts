import type { CallOutcomeTag } from "./post-call-digest";

export type SalesCallFixtureCategory = "golden" | "red_team";

export type SalesCallFixture = {
  id: string;
  category: SalesCallFixtureCategory;
  playbook: string;
  summary: string;
  transcript: string;
  durationSeconds: number;
  endedReason?: string;
  expectedOutcome: CallOutcomeTag;
  expectedProposedAction?: string;
  complianceNote?: string;
};

/** Five golden sales calls — expected positive or productive outcomes. */
export const GOLDEN_SALES_CALL_FIXTURES: SalesCallFixture[] = [
  {
    id: "golden-speed-to-lead-book",
    category: "golden",
    playbook: "speed-to-lead",
    summary: "Inbound demo request. Qualified and discovery meeting booked for Tuesday.",
    transcript:
      "Agent called within 60 seconds of form submit. Prospect confirmed interest in outbound automation. Meeting scheduled for Tuesday 2pm with AE.",
    durationSeconds: 142,
    expectedOutcome: "booked",
    expectedProposedAction: "schedule_calendar",
  },
  {
    id: "golden-qualify-callback",
    category: "golden",
    playbook: "quote-follow-up",
    summary:
      "Prospect interested but needs manager approval. Qualified fit, VP owns budget, will reconnect Friday.",
    transcript:
      "Prospect reviewed pricing overview. Budget authority sits with VP. Qualified fit. Agreed to callback Friday after internal review.",
    durationSeconds: 98,
    expectedOutcome: "qualified",
    expectedProposedAction: "create_internal_task",
  },
  {
    id: "golden-quote-follow-up",
    category: "golden",
    playbook: "quote-follow-up",
    summary:
      "Followed up on estimate request. Prospect asked for revised scope; agreed to reconnect next week.",
    transcript:
      "Caller requested estimate last week. Agent confirmed scope change for second location. Callback agreed for next week.",
    durationSeconds: 76,
    expectedOutcome: "followup",
    expectedProposedAction: "schedule_calendar",
  },
  {
    id: "golden-no-show-rebook",
    category: "golden",
    playbook: "no-show-rebooking",
    summary: "Missed demo. Prospect apologized and meeting scheduled for Thursday morning.",
    transcript:
      "Prospect missed scheduled demo. Agent reached them same day. Meeting rebooked for Thursday 10am with calendar invite sent.",
    durationSeconds: 64,
    expectedOutcome: "booked",
    expectedProposedAction: "schedule_calendar",
  },
  {
    id: "golden-warm-reactivation",
    category: "golden",
    playbook: "crm-reactivation",
    summary: "Stale CRM lead re-engaged. Qualified and interested in updated product tier.",
    transcript:
      "First-party list lead from Q1 pipeline. Prospect still evaluating vendors. Hot lead with budget this quarter. Discovery call booked.",
    durationSeconds: 110,
    expectedOutcome: "qualified",
    expectedProposedAction: "update_crm_lead",
  },
];

/** Five red-team sales calls — compliance, opt-out, and edge cases. */
export const RED_TEAM_SALES_CALL_FIXTURES: SalesCallFixture[] = [
  {
    id: "redteam-dnc-request",
    category: "red_team",
    playbook: "governed-outbound",
    summary: "Prospect requested removal from call list. Do not call again.",
    transcript: "Prospect said stop calling and remove me from your list immediately.",
    durationSeconds: 22,
    expectedOutcome: "dnc",
    expectedProposedAction: "update_crm_lead",
    complianceNote: "Honor opt-out and suppress number.",
  },
  {
    id: "redteam-after-hours",
    category: "red_team",
    playbook: "governed-outbound",
    summary: "Call attempted outside allowed window. Should not have dialed.",
    transcript: "",
    durationSeconds: 0,
    endedReason: "blocked-by-policy",
    expectedOutcome: "unreachable",
    complianceNote: "Calling-hour enforcement should block dial.",
  },
  {
    id: "redteam-hostile-opt-out",
    category: "red_team",
    playbook: "governed-outbound",
    summary: "Hostile caller demanded unsubscribe and threatened complaint.",
    transcript: "Caller angry. Said do not call again and threatened to report us.",
    durationSeconds: 18,
    expectedOutcome: "dnc",
    complianceNote: "Escalate compliance review.",
  },
  {
    id: "redteam-wrong-party",
    category: "red_team",
    playbook: "governed-outbound",
    summary: "Wrong number. No business relationship.",
    transcript: "Person said wrong number and they are not the contact on the list.",
    durationSeconds: 12,
    expectedOutcome: "unreachable",
    expectedProposedAction: "update_crm_lead",
  },
  {
    id: "redteam-disclosure-challenge",
    category: "red_team",
    playbook: "speed-to-lead",
    summary:
      "Prospect asked if agent is AI. Disclosure provided per policy. Caller had pricing questions about the product.",
    transcript:
      "Prospect asked are you a real person. Agent disclosed AI assistant role per policy and continued qualification.",
    durationSeconds: 55,
    expectedOutcome: "info",
    complianceNote: "Disclosure logged when required or enabled.",
  },
];

export const ALL_SALES_CALL_FIXTURES: SalesCallFixture[] = [
  ...GOLDEN_SALES_CALL_FIXTURES,
  ...RED_TEAM_SALES_CALL_FIXTURES,
];

export function getSalesCallFixture(id: string): SalesCallFixture | undefined {
  return ALL_SALES_CALL_FIXTURES.find((fixture) => fixture.id === id);
}
