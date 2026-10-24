import { ACTIVE_OPERATOR_TASK_STATUSES } from "./operator-work-status";

export type CallHappened =
  | "email_sent"
  | "email_pending"
  | "email_failed"
  | "message_taken"
  | "booked"
  | "missed"
  | "no_request";

/**
 * What the account's own records prove about the email a call produced.
 * Derived only from send records (the live tool audit, the send_email
 * approval tasks, and the action execution ledger), never from anything
 * the Bot said on the call.
 */
export type CallEmailState = "sent" | "pending" | "failed";

export type CallEmailExecution = {
  status?: string | null;
  success?: boolean | null;
  queued?: boolean | null;
};

const ACTIVE_TASK_STATUSES: readonly string[] = ACTIVE_OPERATOR_TASK_STATUSES;

export function deriveCallEmailState(input: {
  /** The live voice tool audit shows the sending service accepted an email. */
  liveAccepted?: boolean;
  /** Statuses of the call's send_email approval tasks. */
  taskStatuses?: readonly (string | null | undefined)[];
  /** Auto phase action executions for the call's send_email actions. */
  executions?: readonly CallEmailExecution[];
}): CallEmailState | null {
  const taskStatuses = input.taskStatuses ?? [];
  // An approval is still outstanding: an email from this call has not been
  // sent, whatever an earlier send record says about a different attempt.
  if (taskStatuses.some((status) => status != null && ACTIVE_TASK_STATUSES.includes(status))) {
    return "pending";
  }
  const executions = input.executions ?? [];
  const executedSend = executions.some(
    (execution) =>
      execution.status === "completed" && execution.success === true && execution.queued !== true,
  );
  if (input.liveAccepted || taskStatuses.some((status) => status === "completed") || executedSend) {
    return "sent";
  }
  if (executions.some((execution) => execution.status === "failed")) {
    return "failed";
  }
  return null;
}

export function classifyCallHappened(input: {
  outcomeTag?: string | null;
  endedReason?: string | null;
  emailAccepted?: boolean;
  emailState?: CallEmailState | null;
  messageTaken?: boolean;
}): CallHappened {
  const emailState = input.emailState ?? (input.emailAccepted ? "sent" : null);
  if (emailState === "pending") return "email_pending";
  if (emailState === "failed") return "email_failed";
  if (emailState === "sent") return "email_sent";
  if (input.outcomeTag === "booked") return "booked";
  if (input.messageTaken) return "message_taken";
  const ended = (input.endedReason || "").toLowerCase();
  if (
    input.outcomeTag === "unreachable" ||
    /silence-timed-out|voicemail|machine-detected|customer-busy|no-answer|did-not-answer/.test(
      ended,
    )
  ) {
    return "missed";
  }
  return "no_request";
}

export function callHappenedLabel(happened: CallHappened): string {
  switch (happened) {
    case "email_sent":
      return "Email sent";
    case "email_pending":
      return "Email pending";
    case "email_failed":
      return "Email failed";
    case "message_taken":
      return "Message taken";
    case "booked":
      return "Booked";
    case "missed":
      return "Missed";
    case "no_request":
      return "No request";
  }
}

export function callHappenedDetail(happened: CallHappened): string {
  switch (happened) {
    case "email_sent":
      return "The Bot sent the email during the call.";
    case "email_pending":
      return "An email from this call is waiting for approval. It has not been sent yet.";
    case "email_failed":
      return "The email from this call could not be sent.";
    case "message_taken":
      return "A message was saved for you to review.";
    case "booked":
      return "An appointment was booked.";
    case "missed":
      return "The call was missed.";
    case "no_request":
      return "The caller did not ask for a follow-up.";
  }
}
