import type { CallLog } from "../types/api";

/** Buyer-facing outcome labels for sales wedge taxonomy. */
export const OUTCOME_DISPLAY_LABELS: Record<string, string> = {
  booked: "Booked",
  qualified: "Qualified",
  followup: "Callback",
  dnc: "DNC",
  unreachable: "Unreachable",
  info: "Info",
  other: "Other",
  promised: "Promised",
  recovered: "Recovered",
  escalated: "Escalated",
  not_fit: "Not fit",
};

export function formatOutcomeLabel(tag?: string | null): string {
  if (!tag) return "Pending";
  const key = tag.toLowerCase().replace(/\s+/g, "_");
  return OUTCOME_DISPLAY_LABELS[key] || tag.replace(/_/g, " ");
}

export type OutcomeLifecycleStatus =
  | "needs_review"
  | "action_pending"
  | "approved"
  | "closed"
  | "compliance_hold";

export type OutcomeLedgerRow = CallLog & {
  pending_task_count?: number;
  completed_task_count?: number;
  lifecycle_status?: OutcomeLifecycleStatus;
  compliance_state?: string | null;
  last_action_type?: string | null;
  last_action_status?: string | null;
  owner_label?: string | null;
};

export function summarizeOutcomeRow(row: OutcomeLedgerRow): string {
  return row.summary?.trim() || row.transcript?.trim().slice(0, 160) || "Call completed.";
}

export function deriveLifecycleStatus(args: {
  outcomeTag?: string | null;
  pendingTaskCount: number;
  completedTaskCount: number;
  lastActionStatus?: string | null;
}): OutcomeLifecycleStatus {
  const tag = (args.outcomeTag || "").toLowerCase();
  if (tag === "dnc") return "compliance_hold";
  if (args.pendingTaskCount > 0) return "action_pending";
  if (args.completedTaskCount > 0 || args.lastActionStatus === "completed") return "approved";
  if (tag === "booked" || tag === "qualified") return "closed";
  return "needs_review";
}

export function formatLifecycleLabel(status?: OutcomeLifecycleStatus | null): string {
  switch (status) {
    case "action_pending":
      return "Action pending";
    case "approved":
      return "Approved";
    case "closed":
      return "Closed";
    case "compliance_hold":
      return "Compliance hold";
    default:
      return "Needs review";
  }
}
