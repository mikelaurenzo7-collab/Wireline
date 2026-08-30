/**
 * BotBound voice-provider authority.
 *
 * This boundary is intentionally small and explicit so a provider experiment
 * cannot silently become a customer runtime. Every Bot, including the
 * founder-owned public showcase fleet, uses OpenAI Realtime. Twilio supplies
 * telephone numbers, PSTN/SIP transport, and SMS only.
 */
export const VOICE_RUNTIME_POLICY = {
  founderShowcase: {
    owner: "botbound_founder",
    runtime: "openai_realtime",
    browserTransport: "webrtc",
    phoneTransport: "openai_sip",
    carrier: "twilio",
    fallbackRuntime: null,
  },
  customer: {
    runtime: "openai_realtime",
    browserTransport: "webrtc",
    phoneTransport: "openai_sip",
    carrier: "twilio",
    sms: "twilio",
    fallbackRuntime: null,
  },
} as const;

export type VoiceRuntimeLane = keyof typeof VOICE_RUNTIME_POLICY;

export function customerVoiceRuntimeProvider() {
  return VOICE_RUNTIME_POLICY.customer.runtime;
}

export function founderShowcaseVoiceRuntimeProvider() {
  return VOICE_RUNTIME_POLICY.founderShowcase.runtime;
}
