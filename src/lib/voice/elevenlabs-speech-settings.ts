/** Shared by the preview and live phone path so they evaluate the same voice. */
export const ELEVENLABS_SPEECH_MODEL = "eleven_flash_v2_5";
export const ELEVENLABS_SPEECH_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  speed: 1,
  use_speaker_boost: false,
} as const;
