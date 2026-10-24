/**
 * The one call-outcome taxonomy for the whole product.
 *
 * Call History (Calls list + call report) and Insights Reliability both derive
 * a call's outcome from this module, from the call's raw record fields at read
 * time — never from a stored bucket — so the two surfaces cannot disagree:
 * every Reliability bucket below is exactly the set of calls the Calls list
 * labels with the same name.
 *
 * Two stored taxonomies fed the old disagreement:
 *   - the digest tag on the call row (booked | qualified | followup | dnc |
 *     unreachable | info | other, plus missed / voicemail / completed written
 *     by other paths), which Reliability rendered raw; and
 *   - the Calls-side derivation, which collapsed most of those tags into
 *     "No request" and treated the mere existence of an internal task as
 *     "Message taken" — even when the task recorded that no message content
 *     was provided.
 *
 * Rules worth naming:
 *   - "Message taken" requires message content in the record (see
 *     isMessageContent / messageContentFromTask). A follow-up task without
 *     content is a follow-up request, not a message.
 *   - A record that contains a request (a digest followup/info/qualified/dnc
 *     tag, or any follow-up task) never classifies as "No request".
 *   - A record with no usable evidence at all classifies as "unclassified"
 *     rather than being forced into a wrong bucket.
 */

export type CallOutcome =
  | "email_sent"
  | "booked"
  | "message_taken"
  | "follow_up"
  | "info"
  | "qualified"
  | "dnc"
  | "missed"
  | "no_request"
  | "unclassified";

/** Display order for aggregated outcome buckets. */
export const CALL_OUTCOMES: readonly CallOutcome[] = [
  "email_sent",
  "booked",
  "message_taken",
  "follow_up",
  "info",
  "qualified",
  "dnc",
  "missed",
  "no_request",
  "unclassified",
];

export interface CallOutcomeInput {
  /** Stored digest tag on the call row (any writer's vocabulary). */
  outcomeTag?: string | null;
  /** Provider call-end reason on the call row. */
  endedReason?: string | null;
  /** A send-email tool call for this call completed with an accepted result. */
  emailAccepted?: boolean;
  /**
   * The caller's message text saved with this call, if any. Pass raw text;
   * the classifier only honours it when it is real content (isMessageContent).
   */
  messageContent?: string | null;
  /** A follow-up task exists for this call but carries no message content. */
  hasFollowUpTask?: boolean;
  hasTranscript?: boolean;
  hasSummary?: boolean;
  durationSeconds?: number | null;
}

const MISSED_ENDED_REASON =
  /silence-timed-out|voicemail|machine-detected|customer-busy|no-answer|did-not-answer/;

/**
 * Text that looks like message content but is not: the action engine's
 * boilerplate fallback, notes that explicitly record the absence of a
 * message, and the booking-confirmation task template (a follow-up request,
 * not a message).
 */
const NOT_MESSAGE_CONTENT: readonly RegExp[] = [
  /^\s*internal follow-?up\s*$/i,
  /\bno (message|content)\b/i,
  /\bdid ?n[o']t (leave|provide|give)\b/i,
  /\bmessage (was )?not (left|provided|given|recorded)\b/i,
  /\bno content (was )?(provided|given|left|recorded)\b/i,
  /\bwithout (leaving )?(a )?message\b/i,
  /\basked to book\b[\s\S]*\bcheck calendar\b/i,
];

/** True when the text is an actual caller message, not a placeholder for one. */
export function isMessageContent(text: string | null | undefined): boolean {
  const value = (text || "").trim();
  if (!value) return false;
  return !NOT_MESSAGE_CONTENT.some((pattern) => pattern.test(value));
}

/**
 * Pull the caller's message out of a saved follow-up task, if the task
 * carries one. The message lives in the task payload (message/description)
 * or the task description; boilerplate and "no content" notes return null.
 */
export function messageContentFromTask(task: {
  description?: string | null;
  payload?: unknown;
}): string | null {
  const payload =
    task.payload && typeof task.payload === "object" && !Array.isArray(task.payload)
      ? (task.payload as Record<string, unknown>)
      : {};
  const candidates: unknown[] = [payload.message, payload.description, task.description];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isMessageContent(candidate)) {
      return candidate.trim();
    }
  }
  return null;
}

export function classifyCallOutcome(input: CallOutcomeInput): CallOutcome {
  const tag = (input.outcomeTag || "").trim().toLowerCase();
  if (input.emailAccepted) return "email_sent";
  if (tag === "booked") return "booked";
  if (isMessageContent(input.messageContent)) return "message_taken";
  // A voicemail is a message when its transcription was saved with the call.
  if (tag === "voicemail" && input.hasTranscript) return "message_taken";
  const ended = (input.endedReason || "").toLowerCase();
  if (
    tag === "unreachable" ||
    tag === "missed" ||
    tag === "voicemail" ||
    MISSED_ENDED_REASON.test(ended)
  ) {
    return "missed";
  }
  if (tag === "dnc") return "dnc";
  if (tag === "followup") return "follow_up";
  if (tag === "qualified") return "qualified";
  if (tag === "info") return "info";
  // Any saved follow-up work means the caller asked for something, even when
  // the digest tag is missing or "other": never "No request".
  if (input.hasFollowUpTask) return "follow_up";
  const hasConversationEvidence =
    Boolean(tag) ||
    Boolean(ended) ||
    Boolean(input.hasTranscript) ||
    Boolean(input.hasSummary) ||
    (input.durationSeconds ?? 0) > 0;
  return hasConversationEvidence ? "no_request" : "unclassified";
}

export function callOutcomeLabel(outcome: CallOutcome): string {
  switch (outcome) {
    case "email_sent":
      return "Email sent";
    case "booked":
      return "Booked";
    case "message_taken":
      return "Message taken";
    case "follow_up":
      return "Follow-up requested";
    case "info":
      return "Info request";
    case "qualified":
      return "Qualified";
    case "dnc":
      return "Do not call";
    case "missed":
      return "Missed";
    case "no_request":
      return "No request";
    case "unclassified":
      return "Unclassified";
  }
}

export function callOutcomeDetail(outcome: CallOutcome): string {
  switch (outcome) {
    case "email_sent":
      return "The Bot sent the email during the call.";
    case "booked":
      return "An appointment was booked.";
    case "message_taken":
      return "A message was saved for you to review.";
    case "follow_up":
      return "The caller asked for a follow-up.";
    case "info":
      return "The caller asked for information.";
    case "qualified":
      return "The caller qualified as a lead.";
    case "dnc":
      return "The caller asked not to be called again.";
    case "missed":
      return "The call was missed.";
    case "no_request":
      return "The caller did not ask for a follow-up.";
    case "unclassified":
      return "There is not enough recorded information to say what happened on this call.";
  }
}
