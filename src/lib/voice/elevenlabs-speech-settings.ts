/** Shared by stock catalog speech. Flash is the low-latency phone model. */
export const ELEVENLABS_SPEECH_MODEL = "eleven_flash_v2_5";
export const ELEVENLABS_SPEECH_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  speed: 1,
  use_speaker_boost: false,
} as const;

/** The speed each speech engine documents: `voice_settings.speed` and `generation_config.speed`. */
export const ELEVENLABS_SPEED_RANGE = { min: 0.7, max: 1.2 } as const;
export const CARTESIA_SPEED_RANGE = { min: 0.6, max: 1.5 } as const;

/**
 * A Bot's speaking pace for a library or cloned voice. The pace steps are
 * named for a natural phone pace, which the built-in voices reach at 1.1 and
 * these voices already have at 1.0, so the step is shifted by that difference
 * and held inside the engine's range. Null means the request is left as it
 * is: no pace was chosen, or the chosen one is the engine's own default.
 */
export function librarySpeechSpeed(
  speakingRate: number | null | undefined,
  range: { min: number; max: number },
): number | null {
  if (typeof speakingRate !== "number" || !Number.isFinite(speakingRate)) return null;
  const speed = Math.min(
    range.max,
    Math.max(range.min, Math.round((speakingRate - 0.1) * 100) / 100),
  );
  return speed === 1 ? null : speed;
}

/**
 * A user's clone on a phone call. Similarity 0.8 keeps the recording
 * recognizable; ElevenLabs treats anything higher as artifact-prone.
 * Stability stays at the conversational default so the Bot does not go flat.
 * Speaker boost stays off: Flash ignores it and it muddies 8 kHz audio.
 * Preview uses the same object, so what the owner hears is what callers hear.
 */
export const ELEVENLABS_CLONE_SPEECH_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.8,
  style: 0,
  speed: 1,
  use_speaker_boost: false,
} as const;
