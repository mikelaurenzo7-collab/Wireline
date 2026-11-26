import {
  isMarketingCallPurpose,
  isOutboundCallPurpose,
  type OutboundCallPurpose,
} from "../outbound-call-purpose";

/**
 * Twilio AMD for native outbound SIP.
 *
 * Marketing/sales calls use synchronous detection (`AsyncAmd` stays false) so
 * TwiML is not served, and no realtime session is bridged, until AnsweredBy is
 * known. They use `Enable` and hang up on a machine, fax, or unclassified
 * answer: BotBound has no 64.1200(b)(3) opt-out line, so there is no compliant
 * telemarketing voicemail, and bridging `unknown` would play an uninterruptible
 * telemarketing opening into a mailbox.
 *
 * Service, personal and consumer-requested calls use asynchronous detection.
 * Synchronous AMD holds the answered person in silence until it decides, then
 * the bridge and model attach add more: about six seconds in production on
 * 2026-11-23, and the person hung up before the Bot spoke. Twilio documents
 * that outcome and `AsyncAmd` as the remedy. With `AsyncAmd` the bridge TwiML
 * runs at answer with no AnsweredBy, which already fail-opens to the bridge,
 * and the result arrives later on the signed AMD callback. `Enable` reports a
 * machine at the start of its greeting, so the callback ends the call before
 * the beep and no partial message is recorded. A machine or fax still gets a
 * truthful no-message outcome; `human` and `unknown` keep talking, because a
 * false machine hangup on a slow-to-speak human is worse than a short opening
 * spoken over a greeting nobody records.
 */
export const MARKETING_AMD_TIMEOUT_SECONDS = 8;
export const SERVICE_AMD_TIMEOUT_SECONDS = 30;

export type NativeAmdBridgeAction = "bridge" | "drop" | "voicemail";
export type NativeAsyncAmdAction = "hangup" | "continue";

export type NativeOutboundAmdParams = {
  machineDetection: "Enable";
  machineDetectionTimeout: number;
  asyncAmd?: "true";
  asyncAmdStatusCallback?: string;
  asyncAmdStatusCallbackMethod?: "POST";
};

export function nativeCallPurposeFromMetadata(value: unknown): OutboundCallPurpose {
  // Missing purpose fail-closed to marketing so AMD cannot leave a service
  // identity voicemail — or bridge unknown — on a campaign that lost its class.
  return isOutboundCallPurpose(value) ? value : "marketing_or_sales";
}

export function nativeOutboundAmdParams(
  callPurpose: OutboundCallPurpose,
  asyncStatusCallbackUrl: string,
): NativeOutboundAmdParams {
  if (isMarketingCallPurpose(callPurpose)) {
    return { machineDetection: "Enable", machineDetectionTimeout: MARKETING_AMD_TIMEOUT_SECONDS };
  }
  return {
    machineDetection: "Enable",
    machineDetectionTimeout: SERVICE_AMD_TIMEOUT_SECONDS,
    asyncAmd: "true",
    asyncAmdStatusCallback: asyncStatusCallbackUrl,
    asyncAmdStatusCallbackMethod: "POST",
  };
}

export function isTwilioAnsweringMachineOrFax(answeredBy: string): boolean {
  const value = answeredBy.trim().toLowerCase();
  return value === "fax" || value.startsWith("machine");
}

export function resolveNativeAmdBridgeAction(input: {
  answeredBy: string;
  callPurpose: OutboundCallPurpose;
}): NativeAmdBridgeAction {
  const value = input.answeredBy.trim().toLowerCase();
  const telemarketing = isMarketingCallPurpose(input.callPurpose);
  if (value === "human") return "bridge";
  if (!value || value === "unknown") return telemarketing ? "drop" : "bridge";
  if (value === "fax") return "drop";
  if (value.startsWith("machine")) {
    return telemarketing ? "drop" : "voicemail";
  }
  return telemarketing ? "drop" : "bridge";
}

/** The asynchronous result for a call that is already bridged. */
export function resolveNativeAsyncAmdAction(answeredBy: string): NativeAsyncAmdAction {
  return isTwilioAnsweringMachineOrFax(answeredBy) ? "hangup" : "continue";
}
