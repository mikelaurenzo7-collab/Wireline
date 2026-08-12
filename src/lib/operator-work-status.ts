export const ACTIVE_OPERATOR_TASK_STATUSES = ["pending", "open", "in_progress"] as const;

export type ActiveOperatorTaskStatus = (typeof ACTIVE_OPERATOR_TASK_STATUSES)[number];
