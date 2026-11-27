import { OWNER_DECISION_NEEDED, type ActionItem, type ActionResult } from "./action-types";
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
 * `planPostCallFollowUp`.
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
 * those are one number. A form written with a country code is taken at its
 * word: "+47 912 34 567" is never the US number with the same ten digits.
 */
export function samePhoneNumber(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown) => {
    const cleaned = cleanOutboundSmsPhone(typeof value === "string" ? value : "");
    const digits = cleaned.replace(/\D/g, "");
    if (cleaned.startsWith("+")) return digits;
    // No country code was written, so a ten-digit number is read as a US one.
    return digits.length === 10 ? `1${digits}` : digits;
  };
  const a = canonical(left);
  return a.length >= 8 && a === canonical(right);
}

/** One use of a live tool on the call, whatever became of it. */
export type LiveToolAttempt = { status: string | null | undefined; result: string };

/**
 * What the live text tool did on this call, for a follow-up text to `phone`:
 * - "none": it was not used. Nothing left during the call.
 * - "sent": a text to this number left during the call.
 * - "held": a text to this number is already waiting for an owner who asked
 *   to see texts first.
 * - "other": it was used, cleanly, for a different number only.
 * - "unsettled": some attempt has no clean receipt. The carrier response was
 *   interrupted, the send was refused, or the record never finished. A text
 *   may or may not have reached the caller, so nothing more may leave without
 *   a person looking.
 *
 * Only "none" lets the Bot text after the call on its own. Attempts are only
 * ever added to a call, so once the answer is not "none" it stays that way,
 * and a retry of the follow-up job cannot change its mind and send.
 */
export type LiveTextOutcome = "none" | "sent" | "held" | "other" | "unsettled";

export function liveTextOutcome(
  phone: unknown,
  attempts: readonly LiveToolAttempt[],
): LiveTextOutcome {
  let outcome: LiveTextOutcome = "none";
  for (const attempt of attempts) {
    const result = typeof attempt.result === "string" ? attempt.result : "";
    const sent = /^(?:SMS|WhatsApp) sent to (\S+?)\.(?:\s|$)/.exec(result);
    const held = result.startsWith("DRAFT_SAVED: ")
      ? result.split("\n", 1)[0].slice("DRAFT_SAVED: ".length)
      : null;
    if (attempt.status !== "completed" || (!sent && held === null)) return "unsettled";
    if (sent && samePhoneNumber(sent[1], phone)) outcome = "sent";
    else if (held !== null && samePhoneNumber(held, phone)) {
      if (outcome !== "sent") outcome = "held";
    } else if (outcome === "none") outcome = "other";
  }
  return outcome;
}

/** What the Bot already did on the call, in words the extraction can read. */
export function completedOnCall(input: {
  emailResults: readonly unknown[];
  textAttempts: readonly LiveToolAttempt[];
}): string[] {
  const done: string[] = [];
  for (const result of input.emailResults) {
    if (typeof result !== "string") continue;
    const sent =
      /^SUBMISSION_OK: Email accepted by the sending service for\s+(\S+)\s*\.(?:\s|$)/.exec(result);
    if (sent) done.push(`Sent an email to ${sent[1]}.`);
    else if (result.startsWith("DRAFT_SAVED: "))
      done.push(
        `Wrote an email to ${result.split("\n", 1)[0].slice("DRAFT_SAVED: ".length)} for the owner to send.`,
      );
  }
  for (const attempt of input.textAttempts) {
    if (attempt.status !== "completed" || typeof attempt.result !== "string") continue;
    const sent = /^(?:SMS|WhatsApp) sent to (\S+?)\.(?:\s|$)/.exec(attempt.result);
    if (sent) done.push(`Sent a text to ${sent[1]}.`);
    else if (attempt.result.startsWith("DRAFT_SAVED: "))
      done.push(
        `Wrote a text to ${attempt.result.split("\n", 1)[0].slice("DRAFT_SAVED: ".length)} for the owner to send.`,
      );
  }
  return done;
}

/**
 * Who finishes a follow-up read from a transcript: the Bot, or the owner.
 *
 * The Bot finishes it when nothing about it is a guess. A note for the owner
 * is not a guess. A text back to the number that was on the call is not a
 * guess either, because the carrier supplied that number, as long as the Bot
 * neither texted nor tried to text during the call. The Bot's permission then
 * decides whether it acts or checks first.
 *
 * The rest stays with the owner whatever the permission, each with its reason
 * so the owner is not left to work out why it is waiting:
 * - An email. The address was heard on a call and never read back to the
 *   caller, and mail to a misheard address carries a customer's details to a
 *   stranger. When the caller asks for email during the call, the Bot reads
 *   the address back and sends it then.
 * - A text to any other number. That is new outreach, and the owner has to
 *   confirm they have permission to make it.
 * - A text when the Bot used its text tool at all during the call: one
 *   already left, is already waiting, went to another number, or was
 *   attempted with no clean receipt. A further text is the owner's call.
 * - A second text from the same call. The Bot sends one text of its own per
 *   call; `botIsTexting` says an earlier follow-up from this call has it.
 */
export type PostCallFollowUpPlan = { finisher: "bot" } | { finisher: "owner"; why: string };

export function planPostCallFollowUp(
  action: ExtractedBusinessAction,
  call: {
    callerNumber: string | null | undefined;
    liveText: LiveTextOutcome;
    botIsTexting?: boolean;
  },
): PostCallFollowUpPlan {
  if (action.type === "create_internal_task") return { finisher: "bot" };
  if (action.type === "send_email") {
    return {
      finisher: "owner",
      why: "The address was heard on the call and not read back to the caller. Check it before you send.",
    };
  }
  if (action.type !== "send_text_message") {
    return { finisher: "owner", why: "Your Bot does not do this on its own." };
  }
  if (!samePhoneNumber(action.payload?.to, call.callerNumber)) {
    return {
      finisher: "owner",
      why: "This is not the number that called. Send it only if you have permission to text it.",
    };
  }
  switch (call.liveText) {
    case "none":
      return call.botIsTexting
        ? {
            finisher: "owner",
            why: "Your Bot is already texting this caller about the call. Send this only if it says something new.",
          }
        : { finisher: "bot" };
    case "sent":
      return {
        finisher: "owner",
        why: "Your Bot already texted this number during the call. Send this only if it says something new.",
      };
    case "held":
      return {
        finisher: "owner",
        why: "A text to this number is already waiting from the call. Send this only if it says something new.",
      };
    case "other":
      return {
        finisher: "owner",
        why: "Your Bot texted a different number during the call. Check Texts before you send this one.",
      };
    default:
      return {
        finisher: "owner",
        why: "Your Bot tried to text during the call and the result is not known. Check Texts before you send, so the caller is not texted twice.",
      };
  }
}

/** The owner's list shows `payload.reasoning` beside the message. */
export function withReasonForOwner<T extends { payload: Record<string, unknown> }>(
  action: T,
  why: string,
): T {
  return { ...action, payload: { ...action.payload, reasoning: why } };
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
 * What the owner gets when a follow-up could not be finished, whoever was
 * meant to finish it. A caller's request is never lost quietly.
 *
 * - The Bot tried to send it, nothing left the building, and the owner can
 *   clear the cause (a permission box, calling hours, a line not yet approved
 *   to text): the same message waits for the owner, with the reason.
 * - Anything else becomes a note: the outcome is unknown, the Bot is not set
 *   up to send it, or the message could not even be saved for the owner. A
 *   note is never a second copy to send, so nobody is texted twice.
 */
export type PostCallHandBack =
  | { kind: "draft"; action: ActionItem }
  | { kind: "note"; description: string; priority: ActionItem["priority"]; agentId?: string };

export function postCallFollowUpHandBack(
  action: ActionItem,
  result: ActionResult,
  attempted: "auto" | "draft",
): PostCallHandBack | null {
  if (result.success || result.queued) return null;
  const reason = (result.error || "It could not be finished.").trim();
  const note = (description: string): PostCallHandBack => ({
    kind: "note",
    description: description.slice(0, 1800),
    priority: action.priority,
    ...(action.agentId ? { agentId: action.agentId } : {}),
  });
  const payload = action.payload ?? {};
  if (action.type !== "send_text_message" && action.type !== "send_email") {
    // A note the Bot could not write is written again, as it was.
    return note(field(payload, "description") || action.reasoning?.trim() || reason);
  }
  if (attempted === "auto" && result.retryable === true) {
    // When the Bot itself decided to ask, the reason is already a sentence
    // to the owner about what to decide. Any other refusal says what stopped it.
    const why =
      result.errorCode === OWNER_DECISION_NEEDED ? reason : `Not sent by your Bot: ${reason}`;
    return { kind: "draft", action: withReasonForOwner(action, why) };
  }
  const to = field(payload, "to") || "the caller";
  const body = field(payload, "body");
  const what = action.type === "send_email" ? "an email" : "a text";
  const said = body ? ` The message was: ${body}` : "";
  return note(
    attempted === "auto"
      ? `Your Bot could not confirm ${what} to ${to} was sent. ${reason} Check before sending it again.${said}`
      : `A caller asked for ${what} to ${to} and your Bot could not prepare it for you. ${reason}${said}`,
  );
}
