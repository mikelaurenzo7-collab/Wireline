import type { OpenAIRealtimeVoiceId } from "../voice-catalog";
import type { Pronunciation } from "../phone-voices";
import { configuredPhoneVoiceProvider } from "./realtime-provider";

/**
 * xAI Grok Voice speech-to-speech settings for live phone calls.
 *
 * Docs: https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
 * Production pins a versioned model; the `grok-voice-latest` alias would let a
 * provider release silently change live-call behavior.
 */
export const XAI_GROK_VOICE_PINNED_MODEL = "grok-voice-3.0" as const;
export const XAI_GROK_VOICE_TRANSCRIBER = "grok-transcribe" as const;
/** Published Voice Agent API price, used for spend estimates and receipts. */
export const XAI_GROK_VOICE_USD_PER_MINUTE = 0.08 as const;

/**
 * Every built-in voice the Voice Agent API documents. The first five are the
 * original set; the rest arrived with the current voice library.
 * https://docs.x.ai/developers/model-capabilities/audio/text-to-speech#voices
 */
export const XAI_GROK_VOICES = [
  "eve",
  "ara",
  "rex",
  "sal",
  "leo",
  "carina",
  "celeste",
  "iris",
  "ursa",
  "aurora",
  "luna",
  "liora",
  "castor",
  "atlas",
  "helios",
  "altair",
  "lux",
  "cosmo",
  "lumen",
  "perseus",
  "kepler",
  "zenith",
  "rigel",
  "naksh",
  "sirius",
  "orion",
  "helix",
  "zagan",
] as const;
export type XAIGrokVoice = (typeof XAI_GROK_VOICES)[number];

/**
 * Bots keep their saved voice choice. On a phone call each one is spoken by
 * the current built-in voice closest to it in character, chosen from the
 * voices the vendor describes for support and assistant work, without a
 * regional accent. The original five sounded dated on a phone line.
 */
const OPENAI_TO_XAI_VOICE: Record<OpenAIRealtimeVoiceId, XAIGrokVoice> = {
  marin: "carina",
  shimmer: "iris",
  coral: "ursa",
  sage: "celeste",
  cedar: "castor",
  echo: "helios",
  ballad: "altair",
  alloy: "aurora",
  verse: "atlas",
  ash: "lux",
};

/**
 * How fast the Bot speaks on a call: the documented `audio.output.speed`
 * multiplier, 0.7 to 1.5. A little above the default reads as a natural
 * conversational pace on a phone line; the default itself was heard as slow.
 */
export const PHONE_SPEAKING_RATE_DEFAULT = 1.1 as const;

export function resolvePhoneSpeakingRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(String(env.WIRELINE_PHONE_SPEAKING_RATE ?? "").trim() || Number.NaN);
  return Number.isFinite(raw) && raw >= 0.7 && raw <= 1.5
    ? Math.round(raw * 100) / 100
    : PHONE_SPEAKING_RATE_DEFAULT;
}

export function resolveXAIGrokVoiceModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.XAI_GROK_VOICE_MODEL || "").trim();
  return /^grok-voice-\d+(?:\.\d+)+$/.test(configured) ? configured : XAI_GROK_VOICE_PINNED_MODEL;
}

export function xaiVoiceForSavedVoice(voice: unknown): XAIGrokVoice {
  const id = typeof voice === "string" ? voice.trim().toLowerCase() : "";
  if ((XAI_GROK_VOICES as readonly string[]).includes(id)) return id as XAIGrokVoice;
  return OPENAI_TO_XAI_VOICE[id as OpenAIRealtimeVoiceId] ?? "carina";
}

/**
 * The voice phone callers actually hear for a saved choice, so owner-facing
 * labels stay truthful while phone calls run on xAI. Null means the saved
 * OpenAI voice itself is used.
 */
export function phoneCallVoiceFor(
  savedVoice: unknown,
  env: NodeJS.ProcessEnv = process.env,
): { provider: "xai"; voice: XAIGrokVoice } | null {
  return configuredPhoneVoiceProvider(env) === "xai"
    ? { provider: "xai", voice: xaiVoiceForSavedVoice(savedVoice) }
    : null;
}

/**
 * What the picker shows for the built-in catalog: whether calls can speak it,
 * and the voice in effect. A voice picked by name is itself. A saved voice
 * that is one of the ten is its closest match. Any other saved voice has no
 * certain match, because calls then fall back to the Bot's profile, so none
 * is shown as selected and the picker asks for a choice.
 */
export function catalogVoiceInEffect(
  pickedByName: string | null | undefined,
  savedVoice: unknown,
  env: NodeJS.ProcessEnv = process.env,
): { available: boolean; voice: XAIGrokVoice | null } {
  if (configuredPhoneVoiceProvider(env) !== "xai") return { available: false, voice: null };
  const known = (value: unknown): XAIGrokVoice | null => {
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    if ((XAI_GROK_VOICES as readonly string[]).includes(id)) return id as XAIGrokVoice;
    return OPENAI_TO_XAI_VOICE[id as OpenAIRealtimeVoiceId] ?? null;
  };
  return { available: true, voice: known(pickedByName) ?? known(savedVoice) };
}

/**
 * Cloned voices are spoken natively by the realtime model, so they add no
 * extra hop. If one ever fails mid-call (provider error or replies breaching
 * the latency budget), the call switches to this stock voice and continues.
 */
/** Stock voice that best matches a cloned speaker (salvaged from #1152). */
export const LIVE_VOICE_BY_GENDER = { female: "carina", male: "castor" } as const satisfies Record<
  "female" | "male",
  XAIGrokVoice
>;

/**
 * The stock voice a call switches to when a cloned voice steps aside. A known
 * speaker gender keeps the caller from hearing a jarring change of voice;
 * otherwise the Bot's own saved stock voice answers.
 */
export function stockFallbackVoiceFor(
  savedVoice: unknown,
  cloneGender?: "female" | "male" | null,
): XAIGrokVoice {
  const saved = xaiVoiceForSavedVoice(savedVoice);
  if (cloneGender !== "female" && cloneGender !== "male") return saved;
  // Closest match: the Bot's own stock voice when it already matches the
  // speaker (the caller hears the Bot they configured), else the gender default.
  return XAI_STOCK_VOICE_GENDER[saved] === cloneGender ? saved : LIVE_VOICE_BY_GENDER[cloneGender];
}

/** Presented gender of each stock voice; `sal` is neutral and never a closest match. */
export const XAI_STOCK_VOICE_GENDER: Record<XAIGrokVoice, "female" | "male" | "neutral"> = {
  eve: "female",
  ara: "female",
  carina: "female",
  celeste: "female",
  iris: "female",
  ursa: "female",
  aurora: "female",
  luna: "female",
  liora: "female",
  rex: "male",
  leo: "male",
  castor: "male",
  atlas: "male",
  helios: "male",
  altair: "male",
  lux: "male",
  cosmo: "male",
  lumen: "male",
  perseus: "male",
  kepler: "male",
  zenith: "male",
  rigel: "male",
  naksh: "male",
  sirius: "male",
  orion: "male",
  helix: "male",
  zagan: "male",
  sal: "neutral",
};

/** session.update that swaps only the voice; everything else stays as configured. */
export function xaiVoiceSwapUpdate(voice: string): Record<string, unknown> {
  return { type: "session.update", session: { voice } };
}

/** Per-reply latency budget for a cloned voice before the call moves to stock. */
export function resolveCustomVoiceLatencyBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.WIRELINE_CUSTOM_VOICE_LATENCY_BUDGET_MS);
  return Number.isFinite(raw) && raw >= 800 && raw <= 10_000 ? Math.round(raw) : 2_500;
}

/** "high" (xAI's default) reasons before replying; "none" trades depth for speed. */
export function resolveXAIReasoningEffort(env: NodeJS.ProcessEnv = process.env): "high" | "none" {
  return String(env.XAI_GROK_VOICE_REASONING_EFFORT || "")
    .trim()
    .toLowerCase() === "none"
    ? "none"
    : "high";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Translate the Bot's phone session into xAI's `session.update` shape. Only
 * fields xAI documents are sent: OpenAI-only settings (session type, model in
 * the body, truncation, noise reduction, semantic VAD) are dropped rather than
 * risking a rejected session on a live call.
 */
export function toXAIRealtimeSession(
  openAISession: Record<string, unknown>,
  options: {
    instructions?: string;
    keyterms?: string[];
    customVoiceId?: string | null;
    carrierAudio?: boolean;
    /** The built-in voice chosen for this Bot's calls; without one the saved voice decides. */
    stockVoice?: string | null;
    /** The Bot's own speaking pace; without one the platform default applies. */
    speakingRate?: number | null;
    /** Words spoken differently from how they are written. The transcript keeps the written form. */
    pronunciations?: readonly Pronunciation[];
  } = {},
): Record<string, unknown> {
  const audio = asRecord(openAISession.audio);
  const output = asRecord(audio.output);
  const tools = Array.isArray(openAISession.tools)
    ? openAISession.tools.filter((tool) => asRecord(tool).type === "function")
    : [];
  const keyterms = [...new Set((options.keyterms ?? []).map((term) => term.trim()))]
    .filter((term) => term.length > 0 && term.length <= 50)
    .slice(0, 100);
  // Documented as `replace`: matched whole-word and case-insensitively, before speech.
  const replace = Object.fromEntries(
    (options.pronunciations ?? []).map(({ word, say }) => [word, say]),
  );
  return {
    model: resolveXAIGrokVoiceModel(),
    instructions: options.instructions ?? String(openAISession.instructions || ""),
    voice: options.customVoiceId || xaiVoiceForSavedVoice(options.stockVoice ?? output.voice),
    reasoning: { effort: resolveXAIReasoningEffort() },
    tools,
    tool_choice: openAISession.tool_choice === "none" ? "none" : "auto",
    turn_detection: { type: "server_vad" },
    audio: {
      output: {
        ...(options.carrierAudio ? { format: { type: "audio/pcmu" } } : {}),
        speed: options.speakingRate ?? resolvePhoneSpeakingRate(),
      },
      input: {
        ...(options.carrierAudio ? { format: { type: "audio/pcmu" } } : {}),
        transcription: {
          model: XAI_GROK_VOICE_TRANSCRIBER,
          ...(keyterms.length ? { keyterms } : {}),
        },
      },
    },
    ...(Object.keys(replace).length ? { replace } : {}),
  };
}

/**
 * xAI reports no playback-drain event (no output_audio_buffer.* on its
 * Voice Agent API), so a forced line's playback is inferred: a deliberately
 * slow speaking rate plus TTS and SIP latency margin, timed from when the
 * line was sent. The estimate errs late, never early: a Bot set to speak
 * slower than normal gets proportionally longer, and a faster one gets no less.
 */
export function xaiForcedMessagePlaybackMs(text: string, speakingRate?: number | null): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const slowdown =
    typeof speakingRate === "number" && speakingRate > 0 && speakingRate < 1 ? speakingRate : 1;
  return Math.ceil((words / (2.2 * slowdown)) * 1000) + 1500;
}

/**
 * An exact, non-interruptible line (the compliance opening). xAI speaks it
 * verbatim, drops caller audio while it plays, and starts no model turn until
 * its playback drains.
 */
export function xaiForceMessage(text: string): Record<string, unknown> {
  return {
    type: "conversation.item.create",
    item: {
      type: "force_message",
      role: "assistant",
      interruptible: false,
      content: [{ type: "output_text", text }],
    },
  };
}
