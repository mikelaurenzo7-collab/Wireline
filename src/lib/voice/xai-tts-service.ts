/**
 * xAI text-to-speech engine.
 *
 * `https://api.x.ai/v1/tts` is a real, supported synthesis endpoint and this is
 * the one place Wireline calls it. It backs two surfaces:
 *
 * - **Browser voice previews** for the Wireline Preview voice family.
 * - **Creative renders** (launch reels, campaign voiceover) that want a second
 *   engine alongside ElevenLabs.
 *
 * ## Request shape
 *
 * The endpoint selects a voice identity through `voice_id`; there is no model
 * field to set. `language` is required. `output_format` is an object, not a
 * string — `{ codec, sample_rate, bit_rate }`, where codec is one of
 * mp3 | wav | pcm | mulaw | alaw. Everything here follows that published shape;
 * do not add fields the endpoint does not document.
 *
 * ## Boundary
 *
 * This engine is deliberately NOT reachable from live PSTN routing. Vapi
 * publishes no `xai` voice provider, so there is no supported way to name this
 * engine inside a Vapi assistant payload, and inventing one would fail at dial
 * time on a customer's real call. Phone voices stay on the managed Vapi catalog
 * or an approved ElevenLabs voice through Vapi — see `managed-voice-runtime.ts`.
 * Keep that boundary when extending this file.
 */
import { AppError } from "../api-error";
import { log } from "../server-logger";

const XAI_TTS_URL = "https://api.x.ai/v1/tts";
const XAI_VOICES_URL = "https://api.x.ai/v1/tts/voices";

/** Published codecs. `pcm` at 24 kHz is the lip-sync-ready stream format. */
export type XaiAudioCodec = "mp3" | "wav" | "pcm" | "mulaw" | "alaw";

export const XAI_LIPSYNC_SAMPLE_RATE = 24_000;

const CODEC_MIME: Record<XaiAudioCodec, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pcm: "audio/pcm",
  mulaw: "audio/basic",
  alaw: "audio/x-alaw-basic",
};

export type XaiVoice = {
  id: string;
  name: string;
  description?: string;
};

/**
 * Voices verified against the provider's built-in roster; `eve` is the
 * documented default. `listXaiVoices()` reads the account's live roster when a
 * credential is present, so a provider-side addition becomes auditionable
 * without a deploy, and this list is the floor rather than the ceiling.
 */
export const XAI_BUILTIN_VOICES: readonly XaiVoice[] = [
  { id: "eve", name: "Eve", description: "Bright and energetic." },
  { id: "ara", name: "Ara", description: "Warm and professional." },
  { id: "rex", name: "Rex", description: "Clear and confident." },
  { id: "sal", name: "Sal", description: "Balanced and friendly." },
  { id: "leo", name: "Leo", description: "Direct and energetic." },
] as const;

const BUILTIN_VOICE_IDS = new Set(XAI_BUILTIN_VOICES.map((voice) => voice.id));

/** Endpoint ceiling. Longer copy must be split by the caller, not truncated here. */
export const XAI_TTS_MAX_CHARACTERS = 15_000;

export function xaiTtsConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function isXaiBuiltinVoiceId(value: unknown): value is string {
  return typeof value === "string" && BUILTIN_VOICE_IDS.has(value.trim().toLowerCase());
}

function requireApiKey(): string {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) throw AppError.fromHttpStatus(503, "Voice rendering is not configured.");
  return key;
}

export type XaiOutputFormat = {
  codec: XaiAudioCodec;
  /** 8000 | 16000 | 22050 | 24000 | 44100 | 48000. Provider default is 24000. */
  sampleRate?: number;
  /** MP3 only: 32000 | 64000 | 96000 | 128000 | 192000. */
  bitRate?: number;
};

export type XaiSpeechRequest = {
  text: string;
  voiceId: string;
  /** Omitted entirely when absent, which takes the provider's mp3 default. */
  outputFormat?: XaiOutputFormat;
  /** BCP-47 code or "auto". Required by the endpoint; defaults to "en". */
  language?: string;
  /** Playback multiplier. Clamped to a sane narration band. */
  speed?: number;
  /** "1" trades quality for first-audio latency. */
  optimizeStreamingLatency?: boolean;
  /** Normalize written forms (numbers, dates, URLs) to spoken form. */
  textNormalization?: boolean;
  timeoutMs?: number;
};

export type XaiSpeechResult = {
  audio: ArrayBuffer;
  mimeType: string;
  codec: XaiAudioCodec;
  voiceId: string;
};

function clampSpeed(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(1.5, Math.max(0.7, value));
}

/**
 * Build the request body.
 *
 * Exported so the payload can be asserted without a network round trip. Every
 * optional field is omitted rather than sent as null, so the default call is
 * byte-identical to the minimal documented request.
 */
export function buildXaiSpeechBody(request: XaiSpeechRequest): Record<string, unknown> {
  const speed = clampSpeed(request.speed);
  return {
    text: request.text,
    voice_id: request.voiceId,
    language: request.language || "en",
    ...(request.outputFormat
      ? {
          output_format: {
            codec: request.outputFormat.codec,
            ...(request.outputFormat.sampleRate
              ? { sample_rate: request.outputFormat.sampleRate }
              : {}),
            ...(request.outputFormat.bitRate ? { bit_rate: request.outputFormat.bitRate } : {}),
          },
        }
      : {}),
    ...(speed == null ? {} : { speed }),
    ...(request.optimizeStreamingLatency ? { optimize_streaming_latency: "1" } : {}),
    ...(request.textNormalization == null ? {} : { text_normalization: request.textNormalization }),
  };
}

/**
 * Synthesize speech.
 *
 * Provider status and body are logged server-side and never propagated to the
 * caller: a TTS failure must not become a channel that leaks credential state
 * or account details into a browser response.
 */
export async function synthesizeXaiSpeech(
  request: XaiSpeechRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<XaiSpeechResult> {
  const text = request.text?.trim();
  if (!text) throw AppError.fromHttpStatus(400, "Text is required.");
  if (text.length > XAI_TTS_MAX_CHARACTERS) {
    throw AppError.fromHttpStatus(400, "Text is too long for a single render.");
  }

  const requestedVoice = request.voiceId?.trim();
  if (!requestedVoice) throw AppError.fromHttpStatus(400, "Voice is required.");
  // Built-in ids are canonical lowercase, so any casing a picker sends still
  // lands on them. Account-roster ids pass through verbatim — lowercasing
  // those would corrupt a mixed-case custom voice id before the request.
  const voiceId = isXaiBuiltinVoiceId(requestedVoice)
    ? requestedVoice.toLowerCase()
    : requestedVoice;

  const apiKey = requireApiKey();
  const codec = request.outputFormat?.codec ?? "mp3";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 20_000);

  try {
    const response = await fetchImpl(XAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: CODEC_MIME[codec],
      },
      body: JSON.stringify(buildXaiSpeechBody({ ...request, text, voiceId })),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      log.warn("[xai-tts] provider request rejected", {
        status: response.status,
        voiceId,
        codec,
        detail,
      });
      throw AppError.fromHttpStatus(503, "Voice rendering is temporarily unavailable.");
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) {
      log.warn("[xai-tts] provider returned empty audio", { voiceId, codec });
      throw AppError.fromHttpStatus(503, "Voice rendering is temporarily unavailable.");
    }

    return { audio, mimeType: CODEC_MIME[codec], codec, voiceId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("[xai-tts] synthesis failed", {
      voiceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw AppError.fromHttpStatus(503, "Voice rendering is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

type VoiceRosterRow = { voice_id?: string; id?: string; name?: string; description?: string };

let rosterCache: { at: number; voices: XaiVoice[] } | null = null;
const ROSTER_TTL_MS = 60 * 60 * 1000;

/**
 * The account's live voice roster, falling back to the verified built-in set.
 *
 * A provider outage or roster change degrades to the built-ins rather than
 * emptying the picker, so auditioning never becomes a hard dependency on a
 * catalog call succeeding.
 */
export async function listXaiVoices(fetchImpl: typeof fetch = fetch): Promise<XaiVoice[]> {
  if (!xaiTtsConfigured()) return [...XAI_BUILTIN_VOICES];
  if (rosterCache && Date.now() - rosterCache.at < ROSTER_TTL_MS) return rosterCache.voices;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(XAI_VOICES_URL, {
      headers: { Authorization: `Bearer ${requireApiKey()}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`voice roster failed (${response.status})`);

    const body = (await response.json()) as { voices?: VoiceRosterRow[]; data?: VoiceRosterRow[] };
    const rows = Array.isArray(body.voices)
      ? body.voices
      : Array.isArray(body.data)
        ? body.data
        : [];
    const voices = rows
      .map((row): XaiVoice | null => {
        const id = String(row.voice_id || row.id || "").trim();
        if (!id) return null;
        return { id, name: String(row.name || id), description: row.description };
      })
      .filter((voice): voice is XaiVoice => voice !== null);

    const resolved = voices.length ? voices : [...XAI_BUILTIN_VOICES];
    rosterCache = { at: Date.now(), voices: resolved };
    return resolved;
  } catch (error) {
    log.warn("[xai-tts] voice roster unavailable; using built-in roster", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [...XAI_BUILTIN_VOICES];
  } finally {
    clearTimeout(timeout);
  }
}

/** Test seam — the roster cache is process-wide. */
export function resetXaiVoiceRosterCache(): void {
  rosterCache = null;
}
