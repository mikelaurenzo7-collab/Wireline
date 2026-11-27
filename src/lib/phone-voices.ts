import type { OpenAIRealtimeVoiceId } from "./voice-catalog";

/**
 * Every built-in voice a Bot can speak with on a phone call, and the delivery
 * choices that go with it: pace, pronunciations and names to recognize.
 * Callers hear the chosen voice itself, with no extra speech step. Each voice
 * also names the saved voice closest to it, which answers when a call runs on
 * the backup engine and keeps older readers of the saved voice valid.
 *
 * Shared by the picker and the server, so it imports nothing server-side.
 */
export type PhoneVoiceGender = "female" | "male" | "neutral";

export type PhoneVoice = {
  /** The id the phone engine speaks. */
  id: string;
  name: string;
  /** Two plain words on how it sounds. */
  tone: string;
  gender: PhoneVoiceGender;
  /** Named only when the voice has a regional accent. */
  accent?: "British" | "Australian" | "Indian";
  fallbackVoiceId: OpenAIRealtimeVoiceId;
};

/** Marks a selection from this catalog, beside the legacy "openai" provider. */
export const PHONE_VOICE_PROVIDER = "phone" as const;
/** Where a Bot's chosen phone voice is stored among its other voice choices. */
export const PHONE_BUILTIN_VOICE_KEY = "botboundPhoneVoice";
/** Where a Bot's pace, pronunciations and recognized names are stored. */
export const CALL_DELIVERY_KEY = "botboundCallDelivery";

export const PHONE_VOICES: readonly PhoneVoice[] = [
  // The ten voices the saved choices map to come first.
  {
    id: "carina",
    name: "Carina",
    tone: "Soft & Soothing",
    gender: "female",
    fallbackVoiceId: "marin",
  },
  {
    id: "castor",
    name: "Castor",
    tone: "Easygoing & Down-to-Earth",
    gender: "male",
    fallbackVoiceId: "cedar",
  },
  {
    id: "iris",
    name: "Iris",
    tone: "Friendly & Charming",
    gender: "female",
    fallbackVoiceId: "shimmer",
  },
  {
    id: "atlas",
    name: "Atlas",
    tone: "Commanding & Reassuring",
    gender: "male",
    fallbackVoiceId: "verse",
  },
  {
    id: "celeste",
    name: "Celeste",
    tone: "Compassionate & Assured",
    gender: "female",
    fallbackVoiceId: "sage",
  },
  {
    id: "helios",
    name: "Helios",
    tone: "Upbeat & Versatile",
    gender: "male",
    fallbackVoiceId: "echo",
  },
  {
    id: "ursa",
    name: "Ursa",
    tone: "Warm & Steadfast",
    gender: "female",
    fallbackVoiceId: "coral",
  },
  {
    id: "altair",
    name: "Altair",
    tone: "Elegant & Refined",
    gender: "male",
    fallbackVoiceId: "ballad",
  },
  {
    id: "aurora",
    name: "Aurora",
    tone: "Serene & Steady",
    gender: "female",
    fallbackVoiceId: "alloy",
  },
  { id: "lux", name: "Lux", tone: "Grounded & Calm", gender: "male", fallbackVoiceId: "ash" },
  {
    id: "luna",
    name: "Luna",
    tone: "Gentle & Patient",
    gender: "female",
    fallbackVoiceId: "marin",
  },
  {
    id: "liora",
    name: "Liora",
    tone: "Calm & Luminous",
    gender: "female",
    fallbackVoiceId: "sage",
  },
  {
    id: "cosmo",
    name: "Cosmo",
    tone: "Bright & Easy to Follow",
    gender: "male",
    fallbackVoiceId: "echo",
  },
  {
    id: "lumen",
    name: "Lumen",
    tone: "Warm & Articulate",
    gender: "male",
    fallbackVoiceId: "cedar",
  },
  {
    id: "perseus",
    name: "Perseus",
    tone: "Strong & Trustworthy",
    gender: "male",
    fallbackVoiceId: "ash",
  },
  {
    id: "kepler",
    name: "Kepler",
    tone: "Inventive & Charismatic",
    gender: "male",
    fallbackVoiceId: "verse",
  },
  { id: "zenith", name: "Zenith", tone: "Sharp & Focused", gender: "male", fallbackVoiceId: "ash" },
  {
    id: "sirius",
    name: "Sirius",
    tone: "Quick-Witted & Playful",
    gender: "male",
    fallbackVoiceId: "echo",
  },
  {
    id: "orion",
    name: "Orion",
    tone: "Rich & Cinematic",
    gender: "male",
    fallbackVoiceId: "ballad",
  },
  { id: "helix", name: "Helix", tone: "Bold & Dynamic", gender: "male", fallbackVoiceId: "echo" },
  {
    id: "zagan",
    name: "Zagan",
    tone: "Powerful & Dramatic",
    gender: "male",
    fallbackVoiceId: "ash",
  },
  {
    id: "rigel",
    name: "Rigel",
    tone: "Precise & Professional",
    gender: "male",
    accent: "Australian",
    fallbackVoiceId: "ballad",
  },
  {
    id: "naksh",
    name: "Naksh",
    tone: "Thoughtful & Wise",
    gender: "male",
    accent: "Indian",
    fallbackVoiceId: "cedar",
  },
  // The original five.
  { id: "ara", name: "Ara", tone: "Warm & Friendly", gender: "female", fallbackVoiceId: "coral" },
  {
    id: "eve",
    name: "Eve",
    tone: "Energetic & Upbeat",
    gender: "female",
    accent: "British",
    fallbackVoiceId: "shimmer",
  },
  { id: "rex", name: "Rex", tone: "Confident & Clear", gender: "male", fallbackVoiceId: "cedar" },
  {
    id: "leo",
    name: "Leo",
    tone: "Authoritative & Strong",
    gender: "male",
    accent: "British",
    fallbackVoiceId: "ash",
  },
  {
    id: "sal",
    name: "Sal",
    tone: "Smooth & Balanced",
    gender: "neutral",
    fallbackVoiceId: "alloy",
  },
];

export function phoneVoiceById(value: unknown): PhoneVoice | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return PHONE_VOICES.find((voice) => voice.id === id) ?? null;
}

/** "Soft & Soothing", with the accent when there is one. */
export function phoneVoiceDescription(voice: PhoneVoice): string {
  return voice.accent ? `${voice.tone} · ${voice.accent}` : voice.tone;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The phone voice an owner picked by name, or null when the saved choice decides. */
export function phoneVoiceSelection(variables: unknown): PhoneVoice | null {
  return phoneVoiceById(asRecord(variables)[PHONE_BUILTIN_VOICE_KEY]);
}

/**
 * How fast a Bot speaks. The phone engine documents a 0.7 to 1.5 multiplier;
 * owners choose from five named steps inside the part of that range that
 * still sounds like a person.
 */
export const SPEAKING_PACES = [
  { id: "slow", label: "Slow", rate: 0.9 },
  { id: "relaxed", label: "Relaxed", rate: 1 },
  { id: "natural", label: "Natural", rate: 1.1 },
  { id: "brisk", label: "Brisk", rate: 1.2 },
  { id: "fast", label: "Fast", rate: 1.3 },
] as const;

export type SpeakingPace = (typeof SPEAKING_PACES)[number];

export const SPEAKING_RATE_MIN = 0.7;
export const SPEAKING_RATE_MAX = 1.5;

export function normalizeSpeakingRate(value: unknown): number | null {
  const rate = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(rate) || rate < SPEAKING_RATE_MIN || rate > SPEAKING_RATE_MAX) return null;
  return Math.round(rate * 100) / 100;
}

/** The named step closest to a rate, for showing the current choice. */
export function speakingPaceForRate(rate: number): SpeakingPace {
  let closest: SpeakingPace = SPEAKING_PACES[0];
  for (const pace of SPEAKING_PACES) {
    if (Math.abs(pace.rate - rate) < Math.abs(closest.rate - rate)) closest = pace;
  }
  return closest;
}

/** A word as written, and how the voice should say it. */
export type Pronunciation = { word: string; say: string };

export type CallDelivery = {
  /** Speaking pace multiplier, or null for the platform default. */
  speakingRate: number | null;
  /** Words the voice says differently from how they are written. */
  pronunciations: Pronunciation[];
  /** Names and terms the Bot should recognize when a caller says them. */
  recognizedNames: string[];
};

// The phone engine takes far more of each; these are what one Bot plausibly needs.
export const PRONUNCIATION_LIMIT = 40;
export const PRONUNCIATION_WORD_MAX = 60;
export const PRONUNCIATION_SAY_MAX = 100;
export const RECOGNIZED_NAME_LIMIT = 40;
/** The phone engine's own cap on one recognized term. */
export const RECOGNIZED_NAME_MAX = 50;

/** One line of plain text: no control characters, single spaces, trimmed. */
function cleanLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const hasLetterOrDigit = (value: string) => /[\p{L}\p{N}]/u.test(value);
const lengthOf = (value: string) => Array.from(value).length;

/** Valid entries only, in order, one per word. A word mapped to itself changes nothing and is dropped. */
export function normalizePronunciations(value: unknown): Pronunciation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: Pronunciation[] = [];
  for (const entry of value) {
    const word = cleanLine(asRecord(entry).word);
    const say = cleanLine(asRecord(entry).say);
    const key = word.toLowerCase();
    if (
      !hasLetterOrDigit(word) ||
      !hasLetterOrDigit(say) ||
      lengthOf(word) > PRONUNCIATION_WORD_MAX ||
      lengthOf(say) > PRONUNCIATION_SAY_MAX ||
      key === say.toLowerCase() ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    result.push({ word, say });
    if (result.length === PRONUNCIATION_LIMIT) break;
  }
  return result;
}

/** Valid names only, in order, each once whatever its capitals. */
export function normalizeRecognizedNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const name = cleanLine(entry);
    const key = name.toLowerCase();
    if (!hasLetterOrDigit(name) || lengthOf(name) > RECOGNIZED_NAME_MAX || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length === RECOGNIZED_NAME_LIMIT) break;
  }
  return result;
}

/** What an owner set for this Bot's calls. Anything unreadable falls back to the default. */
export function callDeliverySelection(variables: unknown): CallDelivery {
  const stored = asRecord(asRecord(variables)[CALL_DELIVERY_KEY]);
  return {
    speakingRate: normalizeSpeakingRate(stored.speakingRate),
    pronunciations: normalizePronunciations(stored.pronunciations),
    recognizedNames: normalizeRecognizedNames(stored.recognizedNames),
  };
}

export type CallDeliveryPatch = Partial<{
  speakingRate: number;
  pronunciations: Pronunciation[];
  recognizedNames: string[];
}>;

/**
 * Reads a save request. Unlike stored values, a request is refused outright
 * when any part of it would be dropped, so an owner never sees "Saved" for
 * something that was not kept.
 */
export function parseCallDeliveryPatch(
  body: unknown,
): { ok: true; patch: CallDeliveryPatch } | { ok: false; error: string } {
  const input = asRecord(body);
  const patch: CallDeliveryPatch = {};
  if ("speakingRate" in input) {
    const pace = SPEAKING_PACES.find((candidate) => candidate.rate === input.speakingRate);
    if (!pace) return { ok: false, error: "Choose a speaking pace from the list." };
    patch.speakingRate = pace.rate;
  }
  if ("pronunciations" in input) {
    const entries = input.pronunciations;
    if (!Array.isArray(entries) || entries.length > PRONUNCIATION_LIMIT)
      return { ok: false, error: `Keep pronunciations to ${PRONUNCIATION_LIMIT} or fewer.` };
    const kept = normalizePronunciations(entries);
    if (kept.length !== entries.length)
      return {
        ok: false,
        error:
          "Each pronunciation needs a word and a different way to say it, and each word can appear once.",
      };
    patch.pronunciations = kept;
  }
  if ("recognizedNames" in input) {
    const entries = input.recognizedNames;
    if (!Array.isArray(entries) || entries.length > RECOGNIZED_NAME_LIMIT)
      return { ok: false, error: `Keep names to ${RECOGNIZED_NAME_LIMIT} or fewer.` };
    const kept = normalizeRecognizedNames(entries);
    if (kept.length !== entries.length)
      return {
        ok: false,
        error: `Each name needs letters or numbers, ${RECOGNIZED_NAME_MAX} characters or fewer, and can appear once.`,
      };
    patch.recognizedNames = kept;
  }
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to save." };
  return { ok: true, patch };
}
