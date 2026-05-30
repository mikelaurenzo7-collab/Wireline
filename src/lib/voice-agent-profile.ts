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

/** Deepgram Nova-3 STT — pinned so Vapi cannot silently swap models. */
export const VAPI_TRANSCRIBER_CONFIG = {
  provider: "deepgram" as const,
  model: "nova-3",
  language: "en",
  smartFormat: true,
  endpointing: 40,
};

/** Buffer before shipping LLM tokens to TTS (prevents micro speed-ups on dense strings). */
export const VAPI_INPUT_MIN_CHARACTERS = 30;

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
    // agent starts speaking. Zero across all tiers — 11labs streaming
    // TTS handles first-token latency, so there's no quality reason to
    // throttle.
    responseDelaySeconds: 0,
    // Two-word interrupt threshold for everyone. Lets the caller cut
    // the agent off naturally ("wait, actually…") without false-trigger
    // interruptions from one-word backchannels ("yeah", "mm-hmm").
    numWordsToInterruptAssistant: 2,
    // Level 2 is the sweet spot: perceptibly fast first-audio-out
    // without the jarring speed shifts that levels 3-4 produce when
    // ElevenLabs over-compresses to chase latency. Applied uniformly.
    optimizeStreamingLatency: 2,
  };
}
