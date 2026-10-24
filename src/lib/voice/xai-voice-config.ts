import type { OpenAIRealtimeVoiceId } from "../voice-catalog";
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

export const XAI_GROK_VOICES = ["eve", "ara", "rex", "sal", "leo"] as const;
export type XAIGrokVoice = (typeof XAI_GROK_VOICES)[number];

/**
 * Bots keep their saved OpenAI voice choice; on xAI each one maps to the
 * closest built-in Grok voice by character, so switching providers never
 * leaves a Bot without a voice.
 */
const OPENAI_TO_XAI_VOICE: Record<OpenAIRealtimeVoiceId, XAIGrokVoice> = {
  marin: "eve",
  shimmer: "eve",
  coral: "ara",
  sage: "ara",
  cedar: "rex",
  echo: "rex",
  ballad: "rex",
  alloy: "sal",
  verse: "leo",
  ash: "leo",
};

export function resolveXAIGrokVoiceModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.XAI_GROK_VOICE_MODEL || "").trim();
  return /^grok-voice-\d+(?:\.\d+)+$/.test(configured) ? configured : XAI_GROK_VOICE_PINNED_MODEL;
}

export function xaiVoiceForSavedVoice(voice: unknown): XAIGrokVoice {
  const id = typeof voice === "string" ? voice.trim().toLowerCase() : "";
  if ((XAI_GROK_VOICES as readonly string[]).includes(id)) return id as XAIGrokVoice;
  return OPENAI_TO_XAI_VOICE[id as OpenAIRealtimeVoiceId] ?? "eve";
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
 * Cloned voices are spoken natively by the realtime model, so they add no
 * extra hop. If one ever fails mid-call (provider error or replies breaching
 * the latency budget), the call switches to this stock voice and continues.
 */
/** Stock voice that best matches a cloned speaker (salvaged from #1152). */
export const LIVE_VOICE_BY_GENDER = { female: "ara", male: "rex" } as const satisfies Record<
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
  if (cloneGender === "female" || cloneGender === "male") return LIVE_VOICE_BY_GENDER[cloneGender];
  return xaiVoiceForSavedVoice(savedVoice);
}

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
  options: { instructions?: string; keyterms?: string[]; customVoiceId?: string | null } = {},
): Record<string, unknown> {
  const audio = asRecord(openAISession.audio);
  const output = asRecord(audio.output);
  const tools = Array.isArray(openAISession.tools)
    ? openAISession.tools.filter((tool) => asRecord(tool).type === "function")
    : [];
  const keyterms = [...new Set((options.keyterms ?? []).map((term) => term.trim()))]
    .filter((term) => term.length > 0 && term.length <= 50)
    .slice(0, 100);
  return {
    model: resolveXAIGrokVoiceModel(),
    instructions: options.instructions ?? String(openAISession.instructions || ""),
    voice: options.customVoiceId || xaiVoiceForSavedVoice(output.voice),
    reasoning: { effort: resolveXAIReasoningEffort() },
    tools,
    tool_choice: openAISession.tool_choice === "none" ? "none" : "auto",
    turn_detection: { type: "server_vad" },
    audio: {
      input: {
        transcription: {
          model: XAI_GROK_VOICE_TRANSCRIBER,
          ...(keyterms.length ? { keyterms } : {}),
        },
      },
    },
  };
}

/**
 * xAI reports no playback-drain event (no output_audio_buffer.* on its
 * Voice Agent API), so a forced line's playback is inferred: a deliberately
 * slow speaking rate plus TTS and SIP latency margin, timed from when the
 * line was sent. The estimate errs late, never early.
 */
export function xaiForcedMessagePlaybackMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil((words / 2.2) * 1000) + 1500;
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
