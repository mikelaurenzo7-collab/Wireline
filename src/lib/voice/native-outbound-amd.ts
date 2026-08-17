import {
  isMarketingCallPurpose,
  isOutboundCallPurpose,
  type OutboundCallPurpose,
} from "../outbound-call-purpose";

/**
 * Twilio AMD for native outbound SIP.
 *
 * Synchronous detection (`AsyncAmd` stays false) so TwiML is not served — and
 * xAI is not bridged — until AnsweredBy is known. Marketing/sales calls use
 * `Enable` and hang up on a machine: Wireline has no 64.1200(b)(3) opt-out
 * line, so there is no compliant telemarketing voicemail. Service and
 * consumer-requested callbacks use `DetectMessageEnd` so identity + callback
 * can be left after the greeting/beep, without stating why we called (FDCPA).
 *
 * `unknown` and empty AnsweredBy fail-open to the live SIP agent. A false
 * machine hangup on a slow-to-speak human is worse than talking to a mailbox
 * that we already instructed not to pitch.
 */
export const MARKETING_AMD_TIMEOUT_SECONDS = 5;
export const SERVICE_AMD_TIMEOUT_SECONDS = 30;

export type NativeAmdBridgeAction = "bridge" | "drop" | "voicemail";

export function nativeCallPurposeFromMetadata(
  value: unknown,
): OutboundCallPurpose {
  return isOutboundCallPurpose(value) ? value : "service_or_requested";
}

export function nativeOutboundAmdParams(callPurpose: OutboundCallPurpose): {
  machineDetection: "Enable" | "DetectMessageEnd";
  machineDetectionTimeout: number;
} {
  const telemarketing = isMarketingCallPurpose(callPurpose);
  return {
    machineDetection: telemarketing ? "Enable" : "DetectMessageEnd",
    machineDetectionTimeout: telemarketing
      ? MARKETING_AMD_TIMEOUT_SECONDS
      : SERVICE_AMD_TIMEOUT_SECONDS,
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
  if (!value || value === "human" || value === "unknown") return "bridge";
  if (value === "fax") return "drop";
  if (value.startsWith("machine")) {
    return isMarketingCallPurpose(input.callPurpose) ? "drop" : "voicemail";
  }
  return "bridge";
}
