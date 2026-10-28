export type VoiceProvider = "openai" | "presenter" | "gemini";

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

/**
 * Gemini 3.8 Live prebuilt voices.
 * Grounded in official Google GenAI prebuilt studio voice specifications.
 */
export const GEMINI_LIVE_VOICE_IDS = [
  "Zephyr",
  "Sulafat",
  "Puck",
  "Charon",
  "Despina",
  "Aoede",
  "Fenrir",
  "Kore",
  "Achird",
  "Leda",
] as const;

export type GeminiLiveVoiceId = (typeof GEMINI_LIVE_VOICE_IDS)[number];

export type GeminiLiveVoiceOption = VoiceOption & {
  id: GeminiLiveVoiceId;
  provider: "gemini";
};

export const GEMINI_LIVE_VOICES: readonly GeminiLiveVoiceOption[] = [
  { id: "Zephyr", name: "Zephyr · Bright & Expressive", provider: "gemini", gender: "female" },
  { id: "Sulafat", name: "Sulafat · Warm & Empathetic", provider: "gemini", gender: "female" },
  { id: "Puck", name: "Puck · Upbeat & Balanced", provider: "gemini", gender: "male" },
  { id: "Charon", name: "Charon · Clear & Informative", provider: "gemini", gender: "male" },
  { id: "Despina", name: "Despina · Smooth & Professional", provider: "gemini", gender: "female" },
  { id: "Aoede", name: "Aoede · Breezy & Conversational", provider: "gemini", gender: "female" },
  { id: "Fenrir", name: "Fenrir · Energetic & Forward", provider: "gemini", gender: "male" },
  { id: "Kore", name: "Kore · Firm & Grounded", provider: "gemini", gender: "female" },
  { id: "Achird", name: "Achird · Friendly & Direct", provider: "gemini", gender: "male" },
  { id: "Leda", name: "Leda · Youthful & Assured", provider: "gemini", gender: "female" },
] as const;

/**
 * Maps legacy voice choices deterministically to Gemini 3.8 Live voices.
 */
export const LEGACY_VOICE_TO_GEMINI_LIVE: Record<string, GeminiLiveVoiceId> = {
  marin: "Sulafat",
  cedar: "Charon",
  coral: "Zephyr",
  verse: "Puck",
  ash: "Kore",
  alloy: "Despina",
  ballad: "Charon",
  echo: "Fenrir",
  sage: "Aoede",
  shimmer: "Zephyr",
};

export function resolveGeminiLiveVoice(candidate: string | null | undefined): GeminiLiveVoiceId {
  if (!candidate) return "Zephyr";
  const clean = candidate.trim();
  const directMatch = GEMINI_LIVE_VOICE_IDS.find((id) => id.toLowerCase() === clean.toLowerCase());
  if (directMatch) return directMatch;
  const mapped = LEGACY_VOICE_TO_GEMINI_LIVE[clean.toLowerCase()];
  if (mapped) return mapped;
  return "Zephyr";
}

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
  const geminiMatch = GEMINI_LIVE_VOICES.find((voice) => voice.id.toLowerCase() === normalizedId);
  if (geminiMatch) return geminiMatch.name;
  const match = WIRELINE_LIVE_VOICES.find((voice) => voice.id.toLowerCase() === normalizedId);
  if (match) return match.name;
  return "Unavailable voice";
}
