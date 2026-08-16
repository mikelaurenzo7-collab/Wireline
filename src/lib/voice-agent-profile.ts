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

/**
 * Explicit interruption and recovery behavior for live calls. Flux owns end-of-turn
 * detection; this plan governs what happens while the assistant is already talking.
 * Two transcribed words prevent one-word backchannels and background noise from
 * cutting the agent off, while the short backoff lets a genuine interruption take
 * control without an awkward pause.
 */
export const VAPI_STOP_SPEAKING_PLAN = {
  numWords: 2,
  voiceSeconds: 0.2,
  backoffSeconds: 0.8,
  acknowledgementPhrases: ["okay", "right", "uh-huh", "yeah", "mm-hmm", "got it"],
} as const;

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

/**
 * Hard per-call duration ceilings. Wireline's billing policy is to never cut
 * a live conversation for balance reasons, so the only bound on a runaway
 * call (caller leaves the line open, spam bot, hold music) was Vapi's account
 * default. These ceilings cap worst-case COGS per call without touching any
 * realistic conversation: 40 minutes inbound, 30 minutes outbound.
 */
export const VAPI_MAX_INBOUND_CALL_SECONDS = 2400;
export const VAPI_MAX_OUTBOUND_CALL_SECONDS = 1800;

/**
 * Native voicemail detection for outbound dials. Detection used to rely on
 * the LLM noticing a recorded greeting and calling the leave_voicemail tool
 * — unreliable, and every miss burns minutes talking to a machine. Vapi's
 * built-in detector waits for the beep (up to beepMaxAwaitSeconds) and then
 * speaks the assistant's voicemailMessage. The leave_voicemail tool protocol
 * stays as a second layer for greetings the detector misses.
 */
export const VAPI_VOICEMAIL_DETECTION_PLAN = {
  provider: "vapi" as const,
  beepMaxAwaitSeconds: 30,
};

/**
 * Wireline-tuned post-call analysis, shared by BOTH call directions. Before
 * this was shared, only the inbound factory sent an analysisPlan — outbound
 * calls fell back to Vapi's generic defaults, degrading call-log summaries,
 * lesson extraction, and success metrics for the entire outbound fleet.
 */
export const VAPI_ANALYSIS_PLAN = {
  summaryPrompt:
    "Summarize the call in 2-3 sentences with caller intent, agent action, and committed follow-up.",
  structuredDataPrompt: "Extract caller intent, outcome, commitments, and sentiment as JSON.",
  successEvaluationPrompt:
    "Did the agent accomplish the caller's primary goal or the configured call objective? Consider resolution, correct escalation, and follow-through commitments.",
} as const;

/**
 * Deterministic voicemail fallback spoken when native detection fires.
 * Deliberately says nothing about WHY we called: voicemails can be heard by
 * third parties, and roles like collections are legally barred (FDCPA) from
 * disclosing call context in a message. Identity + callback only.
 *
 * 47 CFR 64.1200(b) applies to this message too — it is an artificial-voice
 * message left on an answering machine, so it must state the responsible
 * business (b)(1) and a callback telephone number (b)(2), not merely allude
 * to caller ID. Both are optional inputs because not every tenant has them
 * configured; when absent the message degrades to the old identity-only form
 * rather than inventing details.
 *
 * TELEMARKETING MESSAGES ARE NOT LEFT AT ALL. (b)(3) additionally requires a
 * prerecorded telemarketing message left on an answering machine to carry a
 * toll-free number that connects the called party to an automated opt-out
 * mechanism. Wireline operates no such opt-out line, so there is no compliant
 * marketing voicemail to compose — and leaving a non-compliant one carries
 * per-call statutory damages. Returning empty makes the provider end the call
 * on voicemail detection instead, which is the only fail-closed answer
 * available. Building the opt-out line is what re-enables marketing voicemail
 * drops; until then this must not be softened into "identity only", because
 * (b)(3) is not satisfied by identity.
 */
export function buildOutboundVoicemailMessage(
  agentName: string,
  businessName?: string | null,
  callbackNumberSpoken?: string | null,
  telemarketing = false,
): string {
  if (telemarketing) return "";
  const business = (businessName ?? "").trim();
  const identity =
    business && business.toLowerCase() !== agentName.trim().toLowerCase()
      ? `${agentName} with ${business}`
      : agentName;
  const callback = callbackNumberSpoken?.trim()
    ? `you can reach us at ${callbackNumberSpoken.trim()}`
    : "you can reach us back at this number";
  return `Hi, this is ${identity}. Sorry I missed you. I'll try you again soon, or ${callback}. Thank you!`;
}

export function getVoiceLatencyProfile(input: {
  archetype?: string;
  role?: string;
  isOutbound?: boolean;
}): VoiceLatencyProfile {
  // Turn-taking pacing is startSpeakingPlan's job. Vapi's silenceTimeoutSeconds
  // ENDS the call after continuous caller silence (min 10s) — never emit a
  // 2–3s "nudge" value here that could be mistaken for that end-call timeout.
  void input;

  return {
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
