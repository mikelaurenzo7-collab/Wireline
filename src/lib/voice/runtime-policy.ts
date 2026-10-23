/**
 * Default OpenAI lane descriptors retained for source-contract compatibility.
 *
 * Browser rehearsal stays on OpenAI Realtime. Actual phone admission is owned
 * by realtime-sip-target.ts: OpenAI is the default, with xAI used only when
 * explicitly configured and the number is registered. realtime-provider.ts
 * binds later control and recovery to the provider encoded in the call id.
 * These descriptors do not choose or switch a running call's provider.
 * Twilio supplies telephone numbers, PSTN/SIP transport, and SMS only.
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
