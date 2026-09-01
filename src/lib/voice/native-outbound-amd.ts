import {
  isMarketingCallPurpose,
  isOutboundCallPurpose,
  type OutboundCallPurpose,
} from "../outbound-call-purpose";

/**
 * Twilio AMD for native outbound SIP.
 *
 * Synchronous detection (`AsyncAmd` stays false) so TwiML is not served — and
 * OpenAI SIP is not bridged — until AnsweredBy is known. Marketing/sales calls use
 * `Enable` and hang up on a machine, fax, or unclassified answer: BotBound has
 * no 64.1200(b)(3) opt-out line, so there is no compliant telemarketing
 * voicemail, and bridging `unknown` would play an uninterruptible telemarketing
 * opening into a mailbox. Service and consumer-requested callbacks retain
 * `DetectMessageEnd` so the route can classify a definite machine after its
 * greeting/beep. Until approved OpenAI-generated fallback audio is deployed,
 * the route converts that `voicemail` classification to a truthful no-message
 * drop. Those calls still fail-open `unknown`/empty to SIP because a false machine hangup on a
 * slow-to-speak human is worse than talking to a mailbox that we already
 * instructed not to pitch.
 */
export const MARKETING_AMD_TIMEOUT_SECONDS = 8;
export const SERVICE_AMD_TIMEOUT_SECONDS = 30;

export type NativeAmdBridgeAction = "bridge" | "drop" | "voicemail";

export function nativeCallPurposeFromMetadata(value: unknown): OutboundCallPurpose {
  // Missing purpose fail-closed to marketing so AMD cannot leave a service
  // identity voicemail — or bridge unknown — on a campaign that lost its class.
  return isOutboundCallPurpose(value) ? value : "marketing_or_sales";
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
  const telemarketing = isMarketingCallPurpose(input.callPurpose);
  if (value === "human") return "bridge";
  if (!value || value === "unknown") return telemarketing ? "drop" : "bridge";
  if (value === "fax") return "drop";
  if (value.startsWith("machine")) {
    return telemarketing ? "drop" : "voicemail";
  }
  return telemarketing ? "drop" : "bridge";
}
