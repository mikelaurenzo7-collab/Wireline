import type { TwilioSendResult } from "./twilio-service-base";

const GENERIC_SMS_UNAVAILABLE =
  "Messaging is unavailable for this workspace right now. Try again later or contact support.";

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
