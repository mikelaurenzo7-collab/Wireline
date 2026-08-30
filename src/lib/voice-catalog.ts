export type VoiceProvider = "openai" | "11labs" | "presenter";

export type VoiceOption = {
  id: string;
  name: string;
  provider: VoiceProvider;
  preview_url?: string | null;
  owned_by_user?: boolean;
  category?: "premade" | "cloned" | string;
  status?: string;
  gender?: "female" | "male";
};

/**
 * Every voice OpenAI currently documents for Realtime sessions. Marin and
 * Cedar are first because OpenAI recommends them for best quality. These ids
 * are used unchanged by browser WebRTC and Twilio-to-OpenAI SIP calls.
 */
export const OPENAI_REALTIME_VOICES: readonly VoiceOption[] = [
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

/** Curated low-latency studio catalog of ElevenLabs premade voices. */
export const ELEVENLABS_CURATED_VOICES: readonly VoiceOption[] = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah · Mature & Reassuring",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "cgSgspJ2msm6clMCkdW9",
    name: "Jessica · Bright & Playful",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam · Firm & Confident",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George · Warm & Captivating",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian · Deep & Comforting",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "hpp4J3VqNfWAUOO0d1Us",
    name: "Bella · Professional & Warm",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice · Clear & Engaging",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    name: "Laura · Upbeat & Spirited",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily · Smooth & Confident",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda · Warm & Professional",
    provider: "11labs",
    gender: "female",
  },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River · Relaxed & Neutral", provider: "11labs" },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel · Steady Broadcaster",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "cjVigY5qzO86Huf0OWal",
    name: "Eric · Smooth & Trustworthy",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "iP95p4xoKVk53GoZ742B",
    name: "Chris · Charming & Down-to-Earth",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "CwhRBWXzGAHq8TQ4Fs17",
    name: "Roger · Laid-Back & Resonant",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "bIHbv24MWmeRgasZH58o",
    name: "Will · Relaxed & Optimistic",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "pqHfZKP75CvOlQylNhV4",
    name: "Bill · Wise & Balanced",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie · Confident & Energetic",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum · Characterful & Husky",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "TX3LPaxmHKxFdv7VOQHJ",
    name: "Liam · Energetic & Confident",
    provider: "11labs",
    gender: "male",
  },
] as const;

export const ELEVENLABS_CORE_VOICE_IDS: readonly string[] = [
  "EXAVITQu4vr4xnSDxMaL",
  "cgSgspJ2msm6clMCkdW9",
  "pNInz6obpgDQGcFmaJgB",
  "JBFqnCBsd6RMkjVDRZzb",
  "nPczCjzI2devNBz1zQrb",
] as const;

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

type ApiVoiceRow = {
  voice_id?: string;
  id?: string;
  name?: string;
  provider?: string;
  preview_url?: string | null;
  owned_by_user?: boolean;
  category?: string;
  status?: string;
  gender?: "female" | "male";
};

export function normalizeApiVoices(raw: unknown): VoiceOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row): VoiceOption | null => {
      const voice = row as ApiVoiceRow;
      const id = voice.voice_id || voice.id;
      if (!id) return null;
      const providerRaw = voice.provider?.toLowerCase();
      const provider: VoiceProvider =
        providerRaw === "11labs"
          ? "11labs"
          : providerRaw === "presenter"
            ? "presenter"
            : "openai";
      return {
        id,
        name: voice.name || id,
        provider,
        preview_url: voice.preview_url ?? null,
        owned_by_user: voice.owned_by_user ?? false,
        category: voice.category,
        status: voice.status,
        gender: voice.gender,
      };
    })
    .filter((voice): voice is VoiceOption => voice !== null);
}

export type VoiceCatalogProviders = {
  wirelineLive: boolean;
  openai: boolean;
  elevenlabs: boolean;
  presenter: boolean;
};

export function resolveVoiceLabel(voiceId: string | null | undefined): string {
  if (!voiceId) return "Not selected";
  const pools = [...WIRELINE_LIVE_VOICES, ...ELEVENLABS_CURATED_VOICES];
  const normalizedId = voiceId.toLowerCase();
  const match = pools.find((voice) => voice.id.toLowerCase() === normalizedId);
  if (match) return match.name;
  return "Custom voice";
}

/** User-facing provider family · no third-party vendor names. */
export function providerLabel(provider: string | null | undefined): string {
  if (provider === "openai") return "OpenAI Realtime";
  if (provider === "11labs") return "ElevenLabs Studio";
  if (provider === "presenter") return "Presenter voice";
  return "BotBound Voice";
}

export function voiceFamilyLabel(provider: VoiceProvider): string {
  if (provider === "openai") return "OpenAI Realtime";
  if (provider === "11labs") return "ElevenLabs Studio";
  if (provider === "presenter") return "Presenter voice";
  return "BotBound Voice";
}

export function voiceRoutingHint(provider: VoiceProvider): string | null {
  if (provider === "openai") return "Used for browser tests and every live phone call.";
  if (provider === "11labs") return "Studio preview and voice-cloning only; live calls use OpenAI Realtime.";
  if (provider === "presenter") {
    return "Presenter lip-sync is separate from calling. Pick an OpenAI Realtime voice for live calls.";
  }
  return null;
}

export function voicePreviewUrl(voice: VoiceOption): string | null {
  if (voice.provider === "11labs") {
    return `/api/voices/${encodeURIComponent(voice.id)}/preview`;
  }
  return null;
}

export function canPreviewVoice(voice: VoiceOption): boolean {
  return voicePreviewUrl(voice) !== null;
}

export function playVoicePreview(
  voice: VoiceOption,
  onEnd: () => void,
  onError: () => void = onEnd,
): HTMLAudioElement | null {
  const url = voicePreviewUrl(voice);
  if (!url) {
    onError();
    return null;
  }
  const audio = new Audio(url);
  audio.onended = onEnd;
  audio.onerror = onError;
  void audio.play().catch(onError);
  return audio;
}
