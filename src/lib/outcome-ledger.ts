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

export type OutcomeLedgerRow = CallLog & {
  pending_task_count?: number;
};

export function summarizeOutcomeRow(row: OutcomeLedgerRow): string {
  return row.summary?.trim() || row.transcript?.trim().slice(0, 160) || "Call completed.";
}
