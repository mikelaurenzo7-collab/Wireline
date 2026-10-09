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
