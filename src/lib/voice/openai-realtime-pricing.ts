/**
 * OpenAI Realtime admission-reserve contract.
 *
 * Official model prices:
 * https://developers.openai.com/api/docs/models/gpt-realtime-2.1
 * Official audio-token cadence and context/caching cost behavior:
 * https://developers.openai.com/api/docs/guides/realtime-costs
 *
 * gpt-realtime-2.1 audio input is $32/M tokens and audio output is
 * $64/M tokens. OpenAI documents 600 input audio tokens/minute and 1,200
 * output audio tokens/minute, so continuous full-duplex audio alone is:
 *
 *   (600 * $32/M) + (1,200 * $64/M) = $0.096/minute = $0.48/5 minutes.
 *
 * Text, special tokens, reasoning, and repeated conversation context are
 * additional. The platform therefore doubles the audio-only floor and rounds
 * up to the next $0.25 for a $1.00 admission reserve. This is a conservative
 * budget reservation, not a claim that a provider invoice cannot exceed it.
 */
export const OPENAI_REALTIME_PRICING_MODEL = "gpt-realtime-2.1" as const;
export const OPENAI_REALTIME_RESERVE_ENV = "WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD" as const;
export const OPENAI_REALTIME_RESERVE_WINDOW_SECONDS = 300 as const;

export const OPENAI_REALTIME_AUDIO_INPUT_USD_PER_MILLION_TOKENS = 32 as const;
export const OPENAI_REALTIME_AUDIO_OUTPUT_USD_PER_MILLION_TOKENS = 64 as const;
export const OPENAI_REALTIME_AUDIO_INPUT_TOKENS_PER_MINUTE = 600 as const;
export const OPENAI_REALTIME_AUDIO_OUTPUT_TOKENS_PER_MINUTE = 1_200 as const;

const TOKENS_PER_MILLION = 1_000_000;
const RESERVE_UNCERTAINTY_MULTIPLIER = 2;
const RESERVE_ROUNDING_INCREMENT_USD = 0.25;

export const OPENAI_REALTIME_FULL_DUPLEX_AUDIO_USD_PER_MINUTE =
  (OPENAI_REALTIME_AUDIO_INPUT_TOKENS_PER_MINUTE *
    OPENAI_REALTIME_AUDIO_INPUT_USD_PER_MILLION_TOKENS +
    OPENAI_REALTIME_AUDIO_OUTPUT_TOKENS_PER_MINUTE *
      OPENAI_REALTIME_AUDIO_OUTPUT_USD_PER_MILLION_TOKENS) /
  TOKENS_PER_MILLION;

export const OPENAI_REALTIME_FIVE_MINUTE_AUDIO_FLOOR_USD =
  OPENAI_REALTIME_FULL_DUPLEX_AUDIO_USD_PER_MINUTE * (OPENAI_REALTIME_RESERVE_WINDOW_SECONDS / 60);

export const OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD =
  Math.ceil(
    (OPENAI_REALTIME_FIVE_MINUTE_AUDIO_FLOOR_USD * RESERVE_UNCERTAINTY_MULTIPLIER) /
      RESERVE_ROUNDING_INCREMENT_USD,
  ) * RESERVE_ROUNDING_INCREMENT_USD;

/**
 * Free Builder hears its Bot in two-minute rehearsals, reserving the same
 * per-second rate as the five-minute window, so its small allowance covers
 * several voice tests instead of one.
 */
export const OPENAI_FREE_REHEARSAL_SECONDS = 120 as const;

/** The admission reserve scaled to a shorter session, rounded up to the next $0.25. */
export function realtimeReserveForWindowUsd(baseReserveUsd: number, windowSeconds: number): number {
  const scaled = (baseReserveUsd * windowSeconds) / OPENAI_REALTIME_RESERVE_WINDOW_SECONDS;
  const steps = Math.ceil(Number((scaled / RESERVE_ROUNDING_INCREMENT_USD).toFixed(6)));
  return Math.max(1, steps) * RESERVE_ROUNDING_INCREMENT_USD;
}

/**
 * Retention-ratio truncation is an official Realtime cost-control mechanism:
 * https://developers.openai.com/api/reference/typescript/resources/realtime/subresources/calls/methods/accept
 * It improves cache stability and bounds post-instruction conversation context,
 * but it does not make turn frequency or total session spend deterministic.
 */
export const OPENAI_REALTIME_COST_TRUNCATION = {
  type: "retention_ratio",
  retention_ratio: 0.8,
  token_limits: { post_instructions: 8_000 },
} as const;

export function isSafeOpenAIRealtimeSessionReserve(raw: string): boolean {
  const normalized = raw.trim();
  if (!normalized) return false;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD;
}

/**
 * Unset means the derived safe fallback. Any explicit malformed or lower value
 * is a configuration error; silently falling back would hide deployment drift.
 */
export function resolveOpenAIRealtimeSessionReserveUsd(
  raw = process.env[OPENAI_REALTIME_RESERVE_ENV],
): number {
  if (raw === undefined || raw.trim() === "") {
    return OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD;
  }
  if (!isSafeOpenAIRealtimeSessionReserve(raw)) {
    throw new Error(
      `${OPENAI_REALTIME_RESERVE_ENV} must be a finite USD amount of at least ` +
        `$${OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD.toFixed(2)} per ` +
        `${OPENAI_REALTIME_RESERVE_WINDOW_SECONDS}-second gpt-realtime-2.1 session.`,
    );
  }
  return Number(raw.trim());
}
