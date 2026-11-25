import type { ExtractedBusinessAction } from "./ai-brains";

function field(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Follow-ups read from a transcript after the call. A booking is never made
 * from it: the Bot books live with the calendar tool, so a post-call booking
 * could double-book or hold a time the caller never confirmed. The owner gets
 * a task to confirm instead. Everything else passes through as a draft.
 */
export function normalizeEmailAddress(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** A completed live send stores SUBMISSION_OK and the accepted address in the tool result. */
export function emailResultAcceptedForRecipient(result: unknown, recipient: unknown): boolean {
  const email = normalizeEmailAddress(recipient);
  if (!email || typeof result !== "string") return false;
  const receipt =
    /^SUBMISSION_OK: Email accepted by the sending service for\s+(\S+)\s*\.(?:\s|$)/.exec(result);
  return normalizeEmailAddress(receipt?.[1]) === email;
}

export function toolAuditResultText(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const record = metadata as Record<string, unknown>;
  const output = record.output;
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const result = (output as Record<string, unknown>).result;
    if (typeof result === "string") return result;
  }
  return typeof record.result === "string" ? record.result : "";
}

/** A live submission or saved approval for this recipient already covers the requested follow-up. */
export function liveEmailAlreadyHandled(
  action: ExtractedBusinessAction,
  completedResults: readonly unknown[],
): boolean {
  if (action.type !== "send_email") return false;
  const recipient = action.payload?.to;
  const email = normalizeEmailAddress(recipient);
  if (!email) return false;
  return completedResults.some(
    (result) =>
      emailResultAcceptedForRecipient(result, email) ||
      (typeof result === "string" &&
        result.startsWith("DRAFT_SAVED: ") &&
        normalizeEmailAddress(result.split("\n", 1)[0].slice("DRAFT_SAVED: ".length)) === email),
  );
}

export function postCallFollowUpAction(action: ExtractedBusinessAction): ExtractedBusinessAction {
  if (action.type !== "schedule_calendar") return action;
  const payload = action.payload ?? {};
  const what = field(payload, "event_name") || "an appointment";
  const who = field(payload, "customer_name");
  const when = [field(payload, "date"), field(payload, "time"), field(payload, "timezone")]
    .filter(Boolean)
    .join(" ");
  return {
    type: "create_internal_task",
    priority: action.priority,
    reasoning: action.reasoning,
    payload: {
      description:
        `${who || "The caller"} asked to book ${what}${when ? ` on ${when}` : ""}. ` +
        "Check Calendar, and book it if your Bot did not on the call.",
    },
  };
}
