import { z } from "zod";

export const CONVERSATION_OUTCOME_STATUSES = [
  "open",
  "waiting",
  "escalated",
  "booked",
  "resolved",
] as const;

export type ConversationOutcomeStatus = (typeof CONVERSATION_OUTCOME_STATUSES)[number];

export const ACTIVE_HANDOFF_TASK_STATUSES = ["pending", "open", "in_progress"] as const;

export const conversationOutcomeSchema = z
  .object({
    status: z.enum(CONVERSATION_OUTCOME_STATUSES),
    handoff: z.boolean().optional().default(false),
  })
  .refine((data) => !data.handoff || data.status === "escalated", {
    message: "Handoff requires status escalated.",
  });

/** Stable input for a Postgres transaction advisory lock. */
export function handoffAdvisoryLockKey(
  userId: string,
  sourceType: "email_thread" | "sms_thread",
  sourceId: string,
): string {
  return `${userId}:${sourceType}:${sourceId}:human_handoff`;
}

/**
 * A conversation that leaves the escalated state must not retain an active
 * human-handoff task. Successful terminal outcomes complete the work; returning
 * to an active non-escalated state withdraws the handoff instead.
 */
export function handoffTaskStatusForOutcome(
  status: ConversationOutcomeStatus,
): "completed" | "cancelled" | null {
  if (status === "escalated") return null;
  if (status === "booked" || status === "resolved") return "completed";
  return "cancelled";
}

export function handoffResolutionNote(
  channel: "email" | "sms",
  status: ConversationOutcomeStatus,
): string {
  if (status === "booked" || status === "resolved") {
    return `${channel.toUpperCase()} conversation marked ${status}; handoff completed.`;
  }
  return `${channel.toUpperCase()} conversation moved to ${status}; handoff withdrawn.`;
}
