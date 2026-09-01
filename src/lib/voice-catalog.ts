export type VoiceProvider = "openai" | "presenter";

export type VoiceOption = {
  id: string;
  name: string;
  provider: VoiceProvider;
  gender?: "female" | "male";
};

/**
 * The complete built-in OpenAI Realtime voice id set. Keep this as the single
 * shared source for browser catalogs, API validation, and Realtime sessions.
 */
export const OPENAI_REALTIME_VOICE_IDS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type OpenAIRealtimeVoiceId = (typeof OPENAI_REALTIME_VOICE_IDS)[number];

type OpenAIRealtimeVoiceOption = VoiceOption & {
  id: OpenAIRealtimeVoiceId;
  provider: "openai";
};

/**
 * Every voice OpenAI currently documents for Realtime sessions. Marin and
 * Cedar are first because OpenAI recommends them for best quality. These ids
 * are used unchanged by browser WebRTC and Twilio-to-OpenAI SIP calls.
 */
export const OPENAI_REALTIME_VOICES: readonly OpenAIRealtimeVoiceOption[] = [
  { id: "marin", name: "Marin · Natural & Expressive", provider: "openai", gender: "female" },
  { id: "cedar", name: "Cedar · Grounded & Clear", provider: "openai", gender: "male" },
  { id: "coral", name: "Coral · Warm & Conversational", provider: "openai", gender: "female" },
  { id: "verse", name: "Verse · Smooth & Professional", provider: "openai", gender: "male" },
  { id: "ash", name: "Ash · Calm & Direct", provider: "openai", gender: "male" },
  { id: "alloy", name: "Alloy · Balanced & Neutral", provider: "openai" },
  { id: "ballad", name: "Ballad · Polished & Measured", provider: "openai", gender: "male" },
  { id: "echo", name: "Echo · Clear & Energetic", provider: "openai", gender: "male" },
  { id: "sage", name: "Sage · Thoughtful & Assured", provider: "openai", gender: "female" },
  { id: "shimmer", name: "Shimmer · Bright & Friendly", provider: "openai", gender: "female" },
] as const;

export const WIRELINE_LIVE_VOICES = OPENAI_REALTIME_VOICES;

export const DEFAULT_PRESENTER_PHONE_VOICE = OPENAI_REALTIME_VOICES[0];

export const MANAGED_VOICE_BY_GENDER = {
  female: "marin",
  male: "cedar",
} as const;

export function defaultPresenterPhoneVoicePayload(): {
  phoneVoiceId: string;
  phoneVoiceProvider: "openai";
} {
  return {
    phoneVoiceId: WIRELINE_LIVE_VOICES[0].id,
    phoneVoiceProvider: "openai",
  };
}

export function resolveVoiceLabel(voiceId: string | null | undefined): string {
  if (!voiceId) return "Not selected";
  const normalizedId = voiceId.toLowerCase();
  const match = WIRELINE_LIVE_VOICES.find((voice) => voice.id.toLowerCase() === normalizedId);
  if (match) return match.name;
  return "Unavailable voice";
}
