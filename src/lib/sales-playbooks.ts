export type SalesPlaybookId =
  | "speed-to-lead"
  | "missed-call-recovery"
  | "quote-follow-up"
  | "no-show-rebooking"
  | "event-webinar-follow-up"
  | "crm-reactivation";

export type SalesPlaybook = {
  id: SalesPlaybookId;
  label: string;
  objective: string;
  leadSourceHint: string;
  scriptHint: string;
  requiresConsent: boolean;
  maxAttempts: number;
};

export const SALES_PLAYBOOKS: SalesPlaybook[] = [
  {
    id: "speed-to-lead",
    label: "Speed-to-lead",
    objective: "Call inbound form and demo requests within 60 seconds.",
    leadSourceHint: "Web form, demo request, or inbound ad lead.",
    scriptHint: "Confirm timing, qualify fit, book discovery call.",
    requiresConsent: false,
    maxAttempts: 2,
  },
  {
    id: "missed-call-recovery",
    label: "Missed-call recovery",
    objective: "Callback every missed sales line within the same business day.",
    leadSourceHint: "Missed inbound call log with caller ID.",
    scriptHint: "Apologize for miss, restate reason, book next step.",
    requiresConsent: false,
    maxAttempts: 3,
  },
  {
    id: "quote-follow-up",
    label: "Quote follow-up",
    objective: "Follow up on pricing and estimate requests.",
    leadSourceHint: "CRM or form leads tagged quote/estimate.",
    scriptHint: "Confirm scope, answer approved pricing questions, book review.",
    requiresConsent: true,
    maxAttempts: 3,
  },
  {
    id: "no-show-rebooking",
    label: "No-show rebooking",
    objective: "Recover missed meetings and demos same day.",
    leadSourceHint: "Calendar no-show list with prior booking consent.",
    scriptHint: "Offer two concrete reschedule slots.",
    requiresConsent: true,
    maxAttempts: 2,
  },
  {
    id: "event-webinar-follow-up",
    label: "Event / webinar follow-up",
    objective: "Call warm event leads with approved context.",
    leadSourceHint: "Event registration or webinar attendee export.",
    scriptHint: "Reference event context, qualify, book next conversation.",
    requiresConsent: true,
    maxAttempts: 3,
  },
  {
    id: "crm-reactivation",
    label: "CRM reactivation",
    objective: "Work stale first-party leads with provenance and caps.",
    leadSourceHint: "CRM stale pipeline with documented prior relationship.",
    scriptHint: "Reference prior context, confirm interest, book or close loop.",
    requiresConsent: true,
    maxAttempts: 2,
  },
];

export function getSalesPlaybook(id: string): SalesPlaybook | undefined {
  return SALES_PLAYBOOKS.find((playbook) => playbook.id === id);
}

export function playbookGoalTag(id: SalesPlaybookId): string {
  return `playbook:${id}`;
}

export function parsePlaybookFromGoal(goal?: string | null): SalesPlaybookId | null {
  if (!goal?.startsWith("playbook:")) return null;
  const id = goal.slice("playbook:".length) as SalesPlaybookId;
  return getSalesPlaybook(id) ? id : null;
}
