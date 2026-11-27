import type { ActionItem, ActionResult } from "./action-types";
import type { ExtractedBusinessAction } from "./ai-brains";
import { cleanOutboundSmsPhone } from "./approved-text-confirmations";

function field(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Follow-ups read from a transcript after the call. A booking is never made
 * from it: the Bot books live with the calendar tool, so a post-call booking
 * could double-book or hold a time the caller never confirmed. The owner gets
 * a task to confirm instead. Who finishes everything else is decided by
 * `postCallFollowUpFinisher`.
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

/**
 * Whether two written forms name the same phone. A transcript reads a US
 * number back as "773-555-0100" where the carrier supplied "+17735550100";
 * those are one number. Any other pair must match digit for digit.
 */
export function samePhoneNumber(left: unknown, right: unknown): boolean {
  const digits = (value: unknown) => {
    const cleaned = cleanOutboundSmsPhone(typeof value === "string" ? value : "").replace(
      /\D/g,
      "",
    );
    return cleaned.length === 11 && cleaned.startsWith("1") ? cleaned.slice(1) : cleaned;
  };
  const a = digits(left);
  return a.length >= 7 && a === digits(right);
}

/**
 * The live text tool reports "SMS sent to +1..." (or "WhatsApp sent to ...")
 * when a text left during the call, and "DRAFT_SAVED: +1..." when the owner
 * asked to see texts first. Either one already covers a follow-up text to that
 * number, so reading the same promise out of the transcript must not text the
 * caller a second time.
 */
export function liveTextAlreadyHandled(
  action: ExtractedBusinessAction,
  completedResults: readonly unknown[],
): boolean {
  if (action.type !== "send_text_message") return false;
  const phone = action.payload?.to;
  return completedResults.some((result) => {
    if (typeof result !== "string") return false;
    const sent = /^(?:SMS|WhatsApp) sent to (\S+?)\.(?:\s|$)/.exec(result);
    if (sent && samePhoneNumber(sent[1], phone)) return true;
    return (
      result.startsWith("DRAFT_SAVED: ") &&
      samePhoneNumber(result.split("\n", 1)[0].slice("DRAFT_SAVED: ".length), phone)
    );
  });
}

/**
 * Who finishes a follow-up read from a transcript: the Bot, or the owner.
 *
 * The Bot finishes it when nothing about it is a guess. A text back to the
 * number that was on the call is not a guess: the carrier supplied that
 * number. A note for the owner is not a guess either. The Bot's permission
 * then decides whether it acts or checks first.
 *
 * Two things stay with the owner whatever the permission:
 * - An email. The address was heard on a call and never read back to the
 *   caller, and mail to a misheard address carries a customer's details to a
 *   stranger. When the caller asks for email during the call, the Bot reads
 *   the address back and sends it then.
 * - A text to any other number. That is new outreach, and the owner has to
 *   confirm they have permission to make it.
 */
export function postCallFollowUpFinisher(
  action: ExtractedBusinessAction,
  callerNumber: string | null | undefined,
): "bot" | "owner" {
  if (action.type === "create_internal_task") return "bot";
  if (action.type !== "send_text_message") return "owner";
  return samePhoneNumber(action.payload?.to, callerNumber) ? "bot" : "owner";
}

/**
 * A text back to the caller goes to the number the carrier supplied, written
 * the way the call record holds it, not to the transcript's rendering of it.
 * The engine only treats a text as a reply to this call when the two match
 * exactly.
 */
export function addressedToCaller<T extends ExtractedBusinessAction>(
  action: T,
  callerNumber: string | null | undefined,
): T {
  if (action.type !== "send_text_message") return action;
  const caller = cleanOutboundSmsPhone(callerNumber);
  if (!caller || !samePhoneNumber(action.payload?.to, caller)) return action;
  return { ...action, payload: { ...action.payload, to: caller } };
}

/**
 * What the owner gets when the Bot could not finish a follow-up on its own.
 * A Bot that acts on its own must never lose a caller's request quietly.
 *
 * - Nothing left the building and the owner can clear the cause (a permission
 *   box, calling hours, a line that is not approved to text yet): the same
 *   message waits for the owner to send.
 * - The outcome is unknown, or the Bot is not set up to send it: a note, never
 *   a second copy to send, so nobody is texted twice.
 */
export function postCallFollowUpHandBack(
  action: ActionItem,
  result: ActionResult,
): { action: ActionItem; autonomy: "draft" | undefined } | null {
  if (result.success || result.queued) return null;
  if (action.type !== "send_text_message" && action.type !== "send_email") return null;
  const reason = (result.error || "It could not be sent.").trim();
  if (result.retryable === true) {
    return {
      // The owner's list shows `payload.reasoning` beside the message.
      action: {
        ...action,
        payload: { ...action.payload, reasoning: `Not sent by your Bot: ${reason}` },
      },
      autonomy: "draft",
    };
  }
  const to = field(action.payload ?? {}, "to") || "the caller";
  const body = field(action.payload ?? {}, "body");
  const what = action.type === "send_email" ? "an email" : "a text";
  return {
    action: {
      type: "create_internal_task",
      priority: action.priority,
      reasoning: action.reasoning,
      ...(action.agentId ? { agentId: action.agentId } : {}),
      payload: {
        description:
          `Your Bot could not confirm ${what} to ${to} was sent. ${reason} ` +
          "Check before sending it again." +
          (body ? ` The message was: ${body.slice(0, 600)}` : ""),
      },
    },
    autonomy: undefined,
  };
}
