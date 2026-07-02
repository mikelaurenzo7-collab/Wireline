export type VoiceProvider = "xai" | "11labs";

export type VoiceOption = {
  id: string;
  name: string;
  provider: VoiceProvider;
  preview_url?: string | null;
  owned_by_user?: boolean;
};

/** Wireline Live voices — low-latency realtime speech. */
export const WIRELINE_LIVE_VOICES: readonly VoiceOption[] = [
  { id: "eve", name: "Eve — Bright & Energetic", provider: "xai" },
  { id: "ara", name: "Ara — Warm & Professional", provider: "xai" },
  { id: "rex", name: "Rex — Clear & Confident", provider: "xai" },
  { id: "sal", name: "Sal — Balanced & Friendly", provider: "xai" },
  { id: "leo", name: "Leo — Direct & Energetic", provider: "xai" },
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
    .map((row) => {
      const voice = row as ApiVoiceRow;
      const id = voice.voice_id || voice.id;
      if (!id) return null;
      return {
        id,
        name: voice.name || id,
        provider: (voice.provider === "xai" ? "xai" : "11labs") as VoiceProvider,
        preview_url: voice.preview_url,
        owned_by_user: voice.owned_by_user,
      };
    })
    .filter((voice): voice is VoiceOption => voice !== null);
}

export function resolveVoiceLabel(voiceId: string | null | undefined): string {
  if (!voiceId) return "Not selected";
  const live = WIRELINE_LIVE_VOICES.find((voice) => voice.id === voiceId);
  if (live) return live.name;
  return voiceId.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** User-facing provider family — no third-party vendor names. */
export function providerLabel(provider: string | null | undefined): string {
  if (provider === "xai") return "Wireline Live";
  return "Wireline Voice";
}

export function voiceFamilyLabel(provider: VoiceProvider): string {
  return provider === "xai" ? "Wireline Live" : "Wireline Voice";
}
