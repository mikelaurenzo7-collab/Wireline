export const ACTIVE_OPERATOR_TASK_STATUSES = ["pending", "open", "in_progress"] as const;

export type ActiveOperatorTaskStatus = (typeof ACTIVE_OPERATOR_TASK_STATUSES)[number];

/** Human work created by Bot tools, with no deferred provider action to execute. */
export const MANUAL_OPERATOR_TASK_TYPES = [
  "internal_task",
  "follow_up",
  "ticket",
  "callback",
  "human_escalation",
  // Meta inbound messages and low-star reviews need a person, not an action.
  "messenger_inbound",
  "review_escalation",
] as const;

export function isManualOperatorTask(
  type: string | null | undefined,
): type is (typeof MANUAL_OPERATOR_TASK_TYPES)[number] {
  return MANUAL_OPERATOR_TASK_TYPES.includes(type as (typeof MANUAL_OPERATOR_TASK_TYPES)[number]);
}
