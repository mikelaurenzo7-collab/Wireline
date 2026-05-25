/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * Mid-call voice swap for bilingual receptionists.
 *
 * The pattern, per the ElevenLabs multi-voice cookbook[1]: when a caller
 * starts the conversation in English then switches to Spanish, we hand
 * the live call off to a clone of the assistant configured with a
 * Spanish-native voice. The caller hears "Sarah" (English) → ~500ms of
 * dead air → "Maria" (Spanish), continuous and seamless from there.
 *
 * Why a handoff instead of a config patch:
 *   Vapi's PATCH /call/{id} endpoint only mutates the call's display
 *   name (per the May 2026 docs). The `voice` block on the running
 *   assistant is immutable mid-call. Vapi's live-call control channel
 *   exposes a `handoff` message type that DOES accept a fresh `voice`
 *   object — so we use that. Trade-off is the ~500ms of dead air during
 *   the handoff vs no swap at all, which is what you get if you leave
 *   the English voice running on Spanish text (the voice tries, fails,
 *   and the caller hears the agent slur Spanish in an English accent).
 *
 * Why the control URL is read from the webhook payload:
 *   The control endpoint lives on a per-region websocket host (e.g.
 *   `aws-us-west-2-production1-phone-call-websocket.vapi.ai`) — NOT on
 *   the main api.vapi.ai host. The exact subdomain depends on which
 *   datacenter the call was provisioned in, so we can't hardcode it.
 *   Vapi exposes it as `call.monitor.controlUrl` or `call.controlUrl`
 *   on the webhook payload; we try both then fall back to the standard
 *   us-west-2 host as a last resort.
 *
 * Auth:
 *   The control URL is signed at call-creation time; no Bearer token
 *   is required when POSTing to it. We do NOT include the
 *   VAPI_PRIVATE_KEY header — Vapi rejects it on the control channel.
 *
 * [1] https://elevenlabs.io/docs/eleven-agents/customization/voice/multi-voice-support
 */

import { log } from "./server-context";

/**
 * Map ISO 639-1 language codes the Vapi transcriber emits to a
 * Deepgram language tag the new assistant should listen for. Anything
 * not in this map falls back to "multi" so Deepgram nova-3 autodetects.
 *
 * Restricted to languages Wireline has ElevenLabs cloned voices for
 * by default — operators with custom dictionaries can extend this via
 * env override in a follow-up if needed.
 */
const DEEPGRAM_LANGUAGE_BY_ISO: Record<string, string> = {
  es: "es",
  fr: "fr",
  pt: "pt",
  de: "de",
  it: "it",
  nl: "nl",
};

export interface VoiceSwapParams {
  /** The live call object from the webhook payload. */
  call: {
    id?: string;
    monitor?: { controlUrl?: string };
    controlUrl?: string;
  };
  /** ISO 639-1 code Vapi reported in the language-change event. */
  detectedLanguage: string;
  /** The secondary voice the operator configured for this agent. */
  secondaryVoiceId: string;
  /** The TTS provider for the secondary voice — defaults to 11labs. */
  voiceProvider?: string;
}

export interface VoiceSwapResult {
  ok: boolean;
  /** Set when ok=false — a one-line reason for ops. */
  reason?: string;
  /** The control URL we actually POSTed to (useful for log grepping). */
  controlUrl?: string;
}

/**
 * Resolve the control URL from the webhook payload, falling back to
 * the standard us-west-2 host. NEVER throws — callers always get a
 * string back so the caller doesn't have to null-check.
 */
function resolveControlUrl(call: VoiceSwapParams["call"]): string | null {
  // Prefer the explicit field Vapi puts on the call object. Both
  // shapes have been observed in prod — `call.monitor.controlUrl` on
  // newer assistants, `call.controlUrl` on legacy ones.
  if (call.monitor?.controlUrl) return call.monitor.controlUrl;
  if (call.controlUrl) return call.controlUrl;
  // Last-resort fallback — most Wireline calls land on us-west-2.
  // Worst case: this 404s and we log + skip the swap.
  if (call.id) {
    return `https://aws-us-west-2-production1-phone-call-websocket.vapi.ai/${call.id}/control`;
  }
  return null;
}

/**
 * Send a `handoff` control message to a live Vapi call so subsequent
 * utterances use the secondary voice. Returns ok=true on a 2xx.
 *
 * Idempotent in the sense that calling it twice with the same voice
 * is a no-op from the caller's perspective — Vapi just re-handoffs to
 * the same config. But we DO NOT debounce here; the webhook handler
 * does that (one swap per call per detected-language transition).
 */
export async function performMidCallVoiceSwap(params: VoiceSwapParams): Promise<VoiceSwapResult> {
  const { call, detectedLanguage, secondaryVoiceId } = params;
  const voiceProvider = params.voiceProvider || "11labs";

  if (!secondaryVoiceId) {
    return { ok: false, reason: "no secondary voice configured" };
  }
  const controlUrl = resolveControlUrl(call);
  if (!controlUrl) {
    return { ok: false, reason: "no call.id or controlUrl on webhook payload" };
  }

  const transcriberLanguage = DEEPGRAM_LANGUAGE_BY_ISO[detectedLanguage] || "multi";

  // The handoff payload — `destination.assistant` carries the override
  // bundle Vapi applies to the live call. We only override the voice
  // and the transcriber language; everything else (system prompt,
  // tools, runtime context) is inherited from the current assistant
  // so the caller's mid-conversation state isn't reset.
  const payload = {
    type: "handoff",
    destination: {
      type: "assistant",
      assistant: {
        name: `wireline-voice-swap-${detectedLanguage}`,
        voice: {
          provider: voiceProvider,
          voiceId: secondaryVoiceId,
          // Pin the TTS model on the swapped-in voice too, so the
          // bilingual handoff doesn't introduce a SECOND cadence shift
          // on top of the language change. Matches the primary
          // assistant factory + outbound client.
          ...(voiceProvider === "11labs" ? { model: "eleven_flash_v2_5" } : {}),
          // Stream as aggressively as the primary voice does — same
          // latency budget regardless of language.
          optimizeStreamingLatency: 4,
        },
        transcriber: {
          provider: "deepgram",
          model: "nova-3",
          language: transcriberLanguage,
        },
      },
    },
    // Surfaced to the caller as the handoff message. Empty = silent
    // handoff (no announcement) so the swap feels invisible.
    content: "",
  };

  try {
    const res = await fetch(controlUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `Vapi control ${res.status}: ${body.slice(0, 200)}`,
        controlUrl,
      };
    }
    return { ok: true, controlUrl };
  } catch (e: any) {
    return {
      ok: false,
      reason: `Vapi control fetch failed: ${e?.message || String(e)}`,
      controlUrl,
    };
  }
}

/**
 * Per-call dedupe set — keeps us from issuing duplicate handoffs when
 * Vapi re-emits the same language-change event (which happens on noisy
 * transcripts). Cleared when a call ends.
 *
 * In-memory is fine here: even at our peak (a few hundred concurrent
 * calls) this tops out at a few KB, and the worst case of a server
 * restart mid-swap is a second handoff — which is idempotent from the
 * caller's perspective (Vapi just stays on the same voice).
 */
const swappedCalls = new Set<string>();

/**
 * Returns true the first time the (callId, language) pair is seen,
 * false on subsequent calls. Used to debounce the
 * language-change-detected webhook so a noisy transcript doesn't
 * fire 5 handoffs in 2 seconds.
 */
export function shouldSwapForCall(callId: string, language: string): boolean {
  const key = `${callId}:${language}`;
  if (swappedCalls.has(key)) return false;
  swappedCalls.add(key);
  return true;
}

/** Clear the dedupe entry — wire this into call-ended handling. */
export function clearSwapDedupe(callId: string): void {
  for (const key of swappedCalls) {
    if (key.startsWith(`${callId}:`)) swappedCalls.delete(key);
  }
}

/** Internal test helper — DO NOT call from prod code. */
export function _resetSwapDedupeForTests(): void {
  swappedCalls.clear();
}

// Re-export for the webhook handler's use; keeping it co-located so
// the dedupe key shape never drifts between the swap call and the
// cleanup hook.
export { resolveControlUrl as _resolveControlUrlForTests };

// Tiny logger wrapper so the test file doesn't have to mock server-context.
export function logSwapAttempt(
  callId: string,
  agentId: string,
  detectedLanguage: string,
  result: VoiceSwapResult,
): void {
  if (result.ok) {
    log.info("Vapi mid-call voice swap succeeded", {
      callId,
      agentId,
      detectedLanguage,
      controlUrl: result.controlUrl,
    });
  } else {
    log.warn("Vapi mid-call voice swap skipped or failed", {
      callId,
      agentId,
      detectedLanguage,
      reason: result.reason,
      controlUrl: result.controlUrl,
    });
  }
}
