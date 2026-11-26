import type { TwilioSendResult } from "./twilio-service-base";

const GENERIC_SMS_UNAVAILABLE =
  "Messaging is unavailable for this workspace right now. Try again later or contact support.";

/**
 * For a boundary that carries any channel's failure text (an approval, a Bot
 * action, a cadence step): only a reason that names the carrier vendor is
 * rewritten, so an email or calendar failure keeps its own wording.
 */
export function withoutCarrierVendorName(text: string): string {
  return /twilio/i.test(text) ? customerSafeSmsFailureReason({ reason: text }) : text;
}

/**
 * What a Bot is told, and may repeat to a caller, when a text was not sent.
 * A reason about setup or the carrier vendor becomes one plain sentence; a
 * reason the caller can act on (opted out, bad number) is kept as written.
 */
export function spokenSmsFailureReason(
  result: Pick<TwilioSendResult, "reason" | "code" | "recovery_path">,
): string {
  if (!String(result.reason || "").trim()) return "Message send failed.";
  const safe = customerSafeSmsFailureReason(result);
  return safe === GENERIC_SMS_UNAVAILABLE ? "The text could not be sent right now." : safe;
}

/**
 * Keep carrier names, deployment state, and credential/configuration details
 * on the operator side of the API boundary. Customer-owned recovery messages
 * (opt-out, invalid destination, balance, or entitlement) remain actionable.
 */
export function customerSafeSmsFailureReason(
  result: Pick<TwilioSendResult, "reason" | "code" | "recovery_path">,
): string {
  const reason = String(result.reason || "").trim();
  if (!reason) return GENERIC_SMS_UNAVAILABLE;

  if (result.code || result.recovery_path) return reason;

  if (
    /\b(twilio|credential|deployment|messaging service|sender configuration)\b/i.test(reason) ||
    /configure (?:a )?(?:twilio )?sender/i.test(reason)
  ) {
    return GENERIC_SMS_UNAVAILABLE;
  }

  if (/rejected (?:the )?(?:message|send request)/i.test(reason)) {
    return "The carrier did not accept this message. Check the number and try again.";
  }

  return reason;
}
