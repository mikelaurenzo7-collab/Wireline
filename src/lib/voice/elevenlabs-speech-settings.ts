/** Shared by stock catalog speech. Flash is the low-latency phone model. */
export const ELEVENLABS_SPEECH_MODEL = "eleven_flash_v2_5";
export const ELEVENLABS_SPEECH_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  speed: 1,
  use_speaker_boost: false,
} as const;

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
