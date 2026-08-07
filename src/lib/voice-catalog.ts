export type VoiceProvider = "xai" | "vapi" | "11labs" | "presenter";

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
 * Legacy curated preview voices for browser auditioning only.
 *
 * These are not the production PSTN voice engine. Browser/mobile live
 * conversations use OpenAI Realtime voice profiles. Phone calls use the
 * managed Vapi catalog or an approved ElevenLabs voice through Vapi with a
 * curated Vapi fallback.
 */
export const WIRELINE_LIVE_VOICES: readonly VoiceOption[] = [
  { id: "eve", name: "Eve — Bright & Energetic", provider: "xai" },
  { id: "ara", name: "Ara — Warm & Professional", provider: "xai" },
  { id: "rex", name: "Rex — Clear & Confident", provider: "xai" },
  { id: "sal", name: "Sal — Balanced & Friendly", provider: "xai" },
  { id: "leo", name: "Leo — Direct & Energetic", provider: "xai" },
] as const;

/**
 * Vapi native voices — included with your phone line, no extra voice provider required.
 * Curated for reception and sales calls.
 */
export const VAPI_CURATED_VOICES: readonly VoiceOption[] = [
  {
    id: "Elliot",
    name: "Elliot — Steady & Professional",
    provider: "vapi",
    gender: "male",
  },
  {
    id: "Savannah",
    name: "Savannah — Warm & Confident",
    provider: "vapi",
    gender: "female",
  },
  {
    id: "Rohan",
    name: "Rohan — Bright & Energetic",
    provider: "vapi",
    gender: "male",
  },
  {
    id: "Emma",
    name: "Emma — Warm & Conversational",
    provider: "vapi",
    gender: "female",
  },
  {
    id: "Clara",
    name: "Clara — Warm & Professional",
    provider: "vapi",
    gender: "female",
  },
  {
    id: "Nico",
    name: "Nico — Casual & Natural",
    provider: "vapi",
    gender: "male",
  },
  {
    id: "Kai",
    name: "Kai — Friendly & Relaxed",
    provider: "vapi",
    gender: "male",
  },
  {
    id: "Sagar",
    name: "Sagar — Steady & Professional",
    provider: "vapi",
    gender: "male",
  },
  {
    id: "Godfrey",
    name: "Godfrey — Young & Energetic",
    provider: "vapi",
    gender: "male",
  },
  {
    id: "Neil",
    name: "Neil — Clear & Professional",
    provider: "vapi",
    gender: "male",
  },
  {
    id: "Layla",
    name: "Layla — Warm & Cheerful",
    provider: "vapi",
    gender: "female",
  },
  { id: "Sid", name: "Sid — Smooth & Deep", provider: "vapi", gender: "male" },
  {
    id: "Naina",
    name: "Naina — Calm & Professional",
    provider: "vapi",
    gender: "female",
  },
] as const;

/**
 * Curated low-latency studio catalog of ElevenLabs *premade* voices — a broad
 * set of professional options for tenants who want a distinct studio voice,
 * each auto-paired with a Wireline Phone (Vapi) fallback in
 * `buildManagedVoiceRuntime`. The curation rule is unchanged in spirit: only
 * vetted premade voices are offered. Wireline never mirrors the founder
 * provider account — generated, cloned, or unrelated private voices stay out
 * of customer-facing responses, and a tenant's own clone reaches the runtime
 * only through the approved-clone path, never this list.
 *
 * `ELEVENLABS_CORE_VOICE_IDS` below is the subset the launch readiness gate
 * hard-requires; the rest are best-effort — if a given account's library has
 * rotated one out, the picker simply omits it and any live call falls back to
 * the paired Vapi voice, so a broad catalog never becomes a launch blocker.
 */
export const ELEVENLABS_CURATED_VOICES: readonly VoiceOption[] = [
  // Core — verified present in the connected account; the readiness gate
  // requires these (ids in ELEVENLABS_CORE_VOICE_IDS).
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah — Mature & Reassuring",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "cgSgspJ2msm6clMCkdW9",
    name: "Jessica — Bright & Playful",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam — Firm & Confident",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George — Warm & Captivating",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian — Deep & Comforting",
    provider: "11labs",
    gender: "male",
  },
  // Extended — all verified premade voices in the account; any that a future
  // library rotation drops simply degrade to the paired Vapi fallback.
  {
    id: "hpp4J3VqNfWAUOO0d1Us",
    name: "Bella — Professional & Warm",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice — Clear & Engaging",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    name: "Laura — Upbeat & Spirited",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily — Smooth & Confident",
    provider: "11labs",
    gender: "female",
  },
  {
    id: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda — Warm & Professional",
    provider: "11labs",
    gender: "female",
  },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River — Relaxed & Neutral", provider: "11labs" },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel — Steady Broadcaster",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "cjVigY5qzO86Huf0OWal",
    name: "Eric — Smooth & Trustworthy",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "iP95p4xoKVk53GoZ742B",
    name: "Chris — Charming & Down-to-Earth",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "CwhRBWXzGAHq8TQ4Fs17",
    name: "Roger — Laid-Back & Resonant",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "bIHbv24MWmeRgasZH58o",
    name: "Will — Relaxed & Optimistic",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "pqHfZKP75CvOlQylNhV4",
    name: "Bill — Wise & Balanced",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie — Confident & Energetic",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "N2lVS1w4EtoT3dr4eOWO",
    name: "Callum — Characterful & Husky",
    provider: "11labs",
    gender: "male",
  },
  {
    id: "TX3LPaxmHKxFdv7VOQHJ",
    name: "Liam — Energetic & Confident",
    provider: "11labs",
    gender: "male",
  },
] as const;

/**
 * The studio voices the launch readiness gate must find in the connected
 * ElevenLabs account. Verified present 2026-08-07 against the account's premade
 * library; every other entry in `ELEVENLABS_CURATED_VOICES` is best-effort with
 * a Vapi fallback, so the broad catalog can never become a launch blocker.
 */
export const ELEVENLABS_CORE_VOICE_IDS: readonly string[] = [
  "EXAVITQu4vr4xnSDxMaL",
  "cgSgspJ2msm6clMCkdW9",
  "pNInz6obpgDQGcFmaJgB",
  "JBFqnCBsd6RMkjVDRZzb",
  "nPczCjzI2devNBz1zQrb",
] as const;

/** Default PSTN voice when presenter lip-sync is the Studio voice. */
export const DEFAULT_PRESENTER_PHONE_VOICE = VAPI_CURATED_VOICES[0];

/** Managed default per gender for quick-deploy surfaces. */
export const MANAGED_VOICE_BY_GENDER = {
  female: "Savannah",
  male: "Elliot",
} as const;

const VAPI_V2_VOICE_IDS = new Set(
  VAPI_CURATED_VOICES.filter((voice) => voice.id !== "Rohan").map((voice) => voice.id),
);

export function vapiVoiceVersion(voiceId: string | null | undefined): 2 | undefined {
  return voiceId && VAPI_V2_VOICE_IDS.has(voiceId) ? 2 : undefined;
}

export function defaultPresenterPhoneVoicePayload(): {
  phoneVoiceId: string;
  phoneVoiceProvider: "vapi";
} {
  return {
    phoneVoiceId: DEFAULT_PRESENTER_PHONE_VOICE.id,
    phoneVoiceProvider: "vapi",
  };
}

/** @deprecated Use WIRELINE_LIVE_VOICES */
export const XAI_VOICE_OPTIONS = WIRELINE_LIVE_VOICES;

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
        providerRaw === "xai"
          ? "xai"
          : providerRaw === "vapi"
            ? "vapi"
            : providerRaw === "11labs"
              ? "11labs"
              : providerRaw === "presenter"
                ? "presenter"
                : "vapi";
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
  vapi: boolean;
  elevenlabs: boolean;
  presenter: boolean;
};

export function resolveVoiceLabel(voiceId: string | null | undefined): string {
  if (!voiceId) return "Not selected";
  const pools = [...WIRELINE_LIVE_VOICES, ...VAPI_CURATED_VOICES, ...ELEVENLABS_CURATED_VOICES];
  const normalizedId = voiceId.toLowerCase();
  const match = pools.find((voice) => voice.id.toLowerCase() === normalizedId);
  if (match) return match.name;
  return "Custom voice";
}

/** User-facing provider family — no third-party vendor names. */
export function providerLabel(provider: string | null | undefined): string {
  if (provider === "xai") return "Wireline Preview";
  if (provider === "vapi") return "Wireline Phone";
  if (provider === "11labs") return "Wireline Studio";
  if (provider === "presenter") return "Presenter voice";
  return "Wireline Voice";
}

export function voiceFamilyLabel(provider: VoiceProvider): string {
  if (provider === "xai") return "Wireline Preview";
  if (provider === "vapi") return "Wireline Phone";
  if (provider === "11labs") return "Wireline Studio";
  if (provider === "presenter") return "Presenter voice";
  return "Wireline Voice";
}

/** Short routing hint for create-flow voice picks. */
export function voiceRoutingHint(provider: VoiceProvider): string | null {
  if (provider === "xai") {
    return "Legacy audio preview only. Live browser/mobile conversations use OpenAI voice profiles; PSTN phone calls use Wireline Phone.";
  }
  if (provider === "vapi") {
    return "Optimized for live phone calls on your Vapi line.";
  }
  if (provider === "11labs") {
    return "Low-latency studio speech with an automatic phone fallback.";
  }
  if (provider === "presenter") {
    return "Studio and browser preview use presenter lip-sync. Pick a Wireline Phone voice below for live PSTN calls.";
  }
  return null;
}

/** Resolve the server preview URL for any voice option. */
export function voicePreviewUrl(voice: VoiceOption): string | null {
  if (voice.provider === "xai") {
    return `/api/voices/curated/preview?provider=xai&voiceId=${encodeURIComponent(voice.id)}`;
  }
  if (voice.provider === "11labs") {
    return `/api/voices/${encodeURIComponent(voice.id)}/preview`;
  }
  // Vapi voices audition during a phone test and presenter voices through the
  // lip-sync sample flow; neither has a standalone GET audio URL, and we never
  // fake one provider's voice with another.
  return null;
}

/** Play a short voice sample in the browser via server-hosted audio. */
export function canPreviewVoice(voice: VoiceOption): boolean {
  return voicePreviewUrl(voice) !== null;
}

/** Play an exact sample; unavailable providers are intentionally not substituted. */
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
