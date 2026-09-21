import type { ConversationOutcomeStatus } from "./conversation-outcome";

export const CONVERSATION_OUTCOME_META = {
  open: { label: "Needs review", variant: "info" },
  waiting: { label: "Waiting", variant: "default" },
  escalated: { label: "Handoff", variant: "warning" },
  booked: { label: "Booked", variant: "success" },
  resolved: { label: "Resolved", variant: "outline" },
} as const satisfies Record<ConversationOutcomeStatus, { label: string; variant: string }>;

export function conversationOutcomeLabel(status: string | null | undefined): string {
  if (status === "routing_conflict") return "Line Review";
  const key = status || "open";
  return Object.prototype.hasOwnProperty.call(CONVERSATION_OUTCOME_META, key)
    ? CONVERSATION_OUTCOME_META[key as ConversationOutcomeStatus].label
    : key;
}
