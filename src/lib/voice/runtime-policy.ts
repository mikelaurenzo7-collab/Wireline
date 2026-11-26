/**
 * Voice lane descriptors for diagnostics and source contracts.
 *
 * xAI voice is the default for every phone call and every number. Studio
 * rehearsals follow it through BotBound's relay (browserRuntime), with OpenAI
 * Realtime WebRTC as their fallback (browserFallbackRuntime); see
 * xai-rehearsal-relay.ts. ChatGPT private simulation stays on OpenAI WebRTC.
 * Actual phone admission is owned by realtime-sip-target.ts: a number registers with xAI
 * automatically, and OpenAI Realtime answers only when xAI is unavailable or a
 * line is still finishing that registration (or when an operator sets
 * WIRELINE_PHONE_VOICE_PROVIDER=openai). realtime-provider.ts binds later
 * control and recovery to the provider encoded in the call id, so these
 * descriptors never choose or switch a running call's provider.
 * Twilio supplies telephone numbers, PSTN/SIP transport, and SMS only.
 */
export const VOICE_RUNTIME_POLICY = {
  founderShowcase: {
    owner: "botbound_founder",
    runtime: "xai_realtime",
    browserTransport: "botbound_relay",
    browserRuntime: "xai_realtime",
    browserFallbackTransport: "webrtc",
    browserFallbackRuntime: "openai_realtime",
    phoneTransport: "xai_sip",
    carrier: "twilio",
    fallbackRuntime: "openai_realtime",
  },
  customer: {
    runtime: "xai_realtime",
    browserTransport: "botbound_relay",
    browserRuntime: "xai_realtime",
    browserFallbackTransport: "webrtc",
    browserFallbackRuntime: "openai_realtime",
    phoneTransport: "xai_sip",
    carrier: "twilio",
    sms: "twilio",
    fallbackRuntime: "openai_realtime",
  },
} as const;

export type VoiceRuntimeLane = keyof typeof VOICE_RUNTIME_POLICY;

export function customerVoiceRuntimeProvider() {
  return VOICE_RUNTIME_POLICY.customer.runtime;
}

export function founderShowcaseVoiceRuntimeProvider() {
  return VOICE_RUNTIME_POLICY.founderShowcase.runtime;
}
