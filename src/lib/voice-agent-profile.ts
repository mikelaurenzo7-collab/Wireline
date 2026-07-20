/**
 * Voice latency / turn-taking profile.
 *
 * Tier-INDEPENDENT by design. Every tenant — Personal through Enterprise —
 * gets the same snappy turn-taking. The conversational feel of the agent
 * is a product fundamental, not a paywalled feature; gating call quality
 * by plan would punish trial users on the exact dimension they're
 * evaluating. Plans differ only in agent count, included minutes, and
 * per-minute overage rates (see plan-catalog.ts) — not in how fast or
 * responsive the agent feels on the wire.
 *
 * Latency still varies by role/archetype because a fast SDR cold-call
 * needs different patience than a support call where the caller is
 * thinking. That's a conversational fit knob, not a tier gate.
 */

export interface VoiceLatencyProfile {
  silenceTimeoutSeconds: number;
  responseDelaySeconds: number;
  numWordsToInterruptAssistant: number;
  optimizeStreamingLatency: number;
}

/**
 * LiveKit smart-endpointing wait curve (milliseconds).
 *
 * x ∈ [0,1] = probability the caller is still speaking (0 = done, 1 = still talking).
 * Our old linear `10 + 5000 * x` waited up to ~5s on mid-range scores — callers
 * perceived dead air between turns. Vapi's "aggressive" sigmoid keeps sub-200ms
 * response when the model is confident the caller finished, while still backing
 * off when they are mid-thought.
 *
 * @see https://docs.vapi.ai/customization/speech-configuration
 */
export const VAPI_SMART_ENDPOINTING_WAIT_FUNCTION = "2000 / (1 + exp(-10 * (x - 0.5)))";

/** Shared turn-taking plan — single source for factory, outbound, showcase. */
export const VAPI_START_SPEAKING_PLAN = {
  waitSeconds: 0.05,
  smartEndpointingPlan: {
    provider: "livekit" as const,
    waitFunction: VAPI_SMART_ENDPOINTING_WAIT_FUNCTION,
  },
};

export const VAPI_TRANSCRIBER_FALLBACK_PLAN = {
  transcribers: [
    {
      provider: "openai" as const,
      model: "gpt-4o-mini-transcribe",
      language: "en",
    },
  ],
};

/** Deepgram Nova-3 STT — pinned so Vapi cannot silently swap models. */
export const VAPI_TRANSCRIBER_CONFIG = {
  provider: "deepgram" as const,
  model: "nova-3",
  language: "en",
  smartFormat: true,
  endpointing: 40,
  fallbackPlan: VAPI_TRANSCRIBER_FALLBACK_PLAN,
};

/** STT + turn-taking strategy. Flux integrates EOT; Nova uses LiveKit on top. */
export type VapiTranscriberMode = "nova-livekit" | "flux-eot";

/**
 * Deepgram Flux — conversational STT with built-in end-of-turn detection.
 * Do NOT pair with smartEndpointingPlan (Vapi uses Flux EOT events directly).
 *
 * Tuning rationale for Wireline employee A/B (Liam):
 *   eotThreshold 0.64 — slightly snappier turn-close vs 0.62; still avoids
 *     0.55 interrupting mid-thought pauses ("let me check…").
 *   eotTimeoutMs 2800 — hard cap below the 5s default; trims dead air on
 *     short acknowledgments while leaving room for email/phone dictation.
 */
export const VAPI_TRANSCRIBER_FLUX_CONFIG = {
  provider: "deepgram" as const,
  model: "flux-general-en",
  language: "en",
  eotThreshold: 0.64,
  eotTimeoutMs: 2800,
  fallbackPlan: VAPI_TRANSCRIBER_FALLBACK_PLAN,
};

/** Flux path: minimal startSpeakingPlan — Flux owns turn boundaries. */
export const VAPI_START_SPEAKING_PLAN_FLUX = {
  waitSeconds: 0.05,
};

/**
 * Outbound: let the callee say "hello" before the opener plays.
 * @see https://docs.vapi.ai/calls/voicemail-detection (firstMessageMode)
 */
export const VAPI_OUTBOUND_FIRST_MESSAGE_MODE = "assistant-waits-for-user" as const;

/** Brief beat after the callee speaks before the agent opens (pairs with waits-for-user). */
export function resolveOutboundStartSpeakingPlan(
  speechPipeline: ReturnType<typeof resolveVapiSpeechPipeline>,
): typeof VAPI_START_SPEAKING_PLAN | typeof VAPI_START_SPEAKING_PLAN_FLUX {
  return {
    ...speechPipeline.startSpeakingPlan,
    waitSeconds: 0.45,
  };
}

/** Production default — Deepgram Flux EOT (English showcase + tenant voice). */
export const VAPI_DEFAULT_TRANSCRIBER_MODE: VapiTranscriberMode = "flux-eot";

export function resolveVapiSpeechPipeline(
  mode: VapiTranscriberMode = VAPI_DEFAULT_TRANSCRIBER_MODE,
): {
  transcriber: typeof VAPI_TRANSCRIBER_CONFIG | typeof VAPI_TRANSCRIBER_FLUX_CONFIG;
  startSpeakingPlan: typeof VAPI_START_SPEAKING_PLAN | typeof VAPI_START_SPEAKING_PLAN_FLUX;
} {
  if (mode === "nova-livekit") {
    return {
      transcriber: VAPI_TRANSCRIBER_CONFIG,
      startSpeakingPlan: VAPI_START_SPEAKING_PLAN,
    };
  }
  return {
    transcriber: VAPI_TRANSCRIBER_FLUX_CONFIG,
    startSpeakingPlan: VAPI_START_SPEAKING_PLAN_FLUX,
  };
}

/** @deprecated Use VAPI_DEFAULT_TRANSCRIBER_MODE — all showcase agents on Flux. */
export function showcaseTranscriberModeForAgent(_agentName: string): VapiTranscriberMode {
  return "flux-eot";
}

export function getVoiceLatencyProfile(input: {
  archetype?: string;
  role?: string;
  isOutbound?: boolean;
}): VoiceLatencyProfile {
  const role = input.role || "customer_service";
  const salesLike =
    input.isOutbound || ["sales", "lead_qualifier", "collections", "scheduler"].includes(role);

  // Archetype-based silence floor. Sales/outbound archetypes get tight
  // 2s windows — a hesitating prospect needs a nudge, not three seconds
  // of dead air. Negotiator sits between (callers weighing terms).
  // Scheduler/Receptionist callers are often consulting calendars or
  // looking up info; 3s gives them room without feeling abandoned.
  const archetypeBase: Record<string, number> = {
    "The Closer": 2,
    "The Hunter": 2,
    "The Negotiator": 2,
    Scheduler: 3,
    Receptionist: 3,
  };

  const archetype = input.archetype || "Receptionist";
  let silenceTimeoutSeconds = archetypeBase[archetype] ?? (salesLike ? 2 : 3);

  // Hard caps applied universally — used to be paid-tier-only. Every
  // tenant gets snappy turn-taking now.
  silenceTimeoutSeconds = salesLike
    ? Math.min(silenceTimeoutSeconds, 2)
    : Math.min(silenceTimeoutSeconds, 3);

  return {
    silenceTimeoutSeconds,
    // Vapi waits this long after the caller stops talking before the
    // agent starts speaking. Zero across all tiers — streaming TTS
    // handles first-token latency, so there's no quality reason to
    // throttle.
    responseDelaySeconds: 0,
    // Two-word interrupt threshold for everyone. Lets the caller cut
    // the agent off naturally ("wait, actually…") without false-trigger
    // interruptions from one-word backchannels ("yeah", "mm-hmm").
    numWordsToInterruptAssistant: 2,
    // Level 3 — faster first-audio-out on showcase + tenant agents.
    // Level 4 (showcase-only override) trades a hair of prosody for
    // ~30ms TTFA; tenant default stays at 3 to avoid cadence swings.
    optimizeStreamingLatency: 3,
  };
}
