export type VoiceProvider = "xai" | "11labs" | "vapi" | "presenter";

export type VoiceOption = {
  id: string;
  name: string;
  provider: VoiceProvider;
  preview_url?: string | null;
  owned_by_user?: boolean;
};

/** Wireline Live voices — low-latency realtime speech (xAI Grok). */
export const WIRELINE_LIVE_VOICES: readonly VoiceOption[] = [
  { id: "eve", name: "Eve — Bright & Energetic", provider: "xai" },
  { id: "ara", name: "Ara — Warm & Professional", provider: "xai" },
  { id: "rex", name: "Rex — Clear & Confident", provider: "xai" },
  { id: "sal", name: "Sal — Balanced & Friendly", provider: "xai" },
  { id: "leo", name: "Leo — Direct & Energetic", provider: "xai" },
] as const;

/**
 * Vapi native voices — included with your phone line, no ElevenLabs key required.
 * Curated for reception and sales calls.
 */
export const VAPI_CURATED_VOICES: readonly VoiceOption[] = [
  { id: "Elliot", name: "Elliot — Steady & Professional", provider: "vapi" },
  { id: "Kylie", name: "Kylie — Bright & Friendly", provider: "vapi" },
  { id: "Lily", name: "Lily — Soft & Clear", provider: "vapi" },
  { id: "Savannah", name: "Savannah — Warm & Confident", provider: "vapi" },
  { id: "Rohan", name: "Rohan — Calm & Assured", provider: "vapi" },
  { id: "Hana", name: "Hana — Crisp & Polished", provider: "vapi" },
  { id: "Neha", name: "Neha — Upbeat & Helpful", provider: "vapi" },
  { id: "Cole", name: "Cole — Direct & Grounded", provider: "vapi" },
] as const;

/** @deprecated Use WIRELINE_LIVE_VOICES */
export const XAI_VOICE_OPTIONS = WIRELINE_LIVE_VOICES;

type ApiVoiceRow = {
  voice_id?: string;
  id?: string;
  name?: string;
  provider?: string;
  preview_url?: string | null;
  owned_by_user?: boolean;
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
            : providerRaw === "presenter"
              ? "presenter"
              : "11labs";
      return {
        id,
        name: voice.name || id,
        provider,
        preview_url: voice.preview_url ?? null,
        owned_by_user: voice.owned_by_user ?? false,
      };
    })
    .filter((voice): voice is VoiceOption => voice !== null);
}

export type VoiceCatalogProviders = {
  elevenlabs: boolean;
  wirelineLive: boolean;
  vapi: boolean;
  presenter: boolean;
};

export function resolveVoiceLabel(voiceId: string | null | undefined): string {
  if (!voiceId) return "Not selected";
  const pools = [...WIRELINE_LIVE_VOICES, ...VAPI_CURATED_VOICES];
  const match = pools.find((voice) => voice.id === voiceId);
  if (match) return match.name;
  return voiceId.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** User-facing provider family — no third-party vendor names. */
export function providerLabel(provider: string | null | undefined): string {
  if (provider === "xai") return "Wireline Live";
  if (provider === "vapi") return "Wireline Phone";
  if (provider === "presenter") return "Presenter voice";
  return "Wireline Voice";
}

export function voiceFamilyLabel(provider: VoiceProvider): string {
  if (provider === "xai") return "Wireline Live";
  if (provider === "vapi") return "Wireline Phone";
  if (provider === "presenter") return "Presenter voice";
  return "Wireline Voice";
}

/** Short routing hint for create-flow voice picks. */
export function voiceRoutingHint(provider: VoiceProvider): string | null {
  if (provider === "xai") {
    return "Best for browser simulator and low-latency tests. For PSTN phone calls, prefer Wireline Phone or Voice library.";
  }
  if (provider === "vapi") {
    return "Optimized for live phone calls on your Vapi line.";
  }
  if (provider === "presenter") {
    return "Matched for on-screen presenter lip-sync. For PSTN phone calls, also pick Wireline Phone or Voice library.";
  }
  return null;
}

/** Resolve the server preview URL for any voice option. */
export function voicePreviewUrl(voice: VoiceOption): string {
  if (voice.preview_url) return voice.preview_url;
  if (voice.provider === "xai") {
    return `/api/voices/curated/preview?provider=xai&voiceId=${encodeURIComponent(voice.id)}`;
  }
  if (voice.provider === "vapi") {
    return `/api/voices/curated/preview?provider=vapi&voiceId=${encodeURIComponent(voice.id)}`;
  }
  if (voice.provider === "presenter") {
    return `/api/voices/presenter/${encodeURIComponent(voice.id)}/preview`;
  }
  return `/api/voices/${encodeURIComponent(voice.id)}/preview`;
}

/** Play a short voice sample in the browser via server-hosted audio. */
export function playVoicePreview(voice: VoiceOption, onEnd: () => void): void {
  const url = voicePreviewUrl(voice);
  const audio = new Audio(url);
  audio.onended = onEnd;
  audio.onerror = onEnd;
  void audio.play().catch(onEnd);
}
