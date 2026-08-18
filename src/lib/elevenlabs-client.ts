/**
 * Minimal server-only ElevenLabs client for Wireline-managed TTS and approved
 * instant voice cloning. Native fetch keeps the serverless cold start small.
 */
import { fetchWithTimeout } from "./server-context";
import { ELEVENLABS_REALTIME_MODEL } from "./managed-voice-runtime";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string | null;
  description?: string | null;
}

const VOICE_ROSTER_TTL_MS = 60 * 60 * 1000;
let voiceRosterCache: { at: number; voices: ElevenLabsVoice[] } | null = null;

export class ElevenLabsProviderError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
  ) {
    super(`ElevenLabs ${operation} failed (${status || "network"})`);
    this.name = "ElevenLabsProviderError";
  }
}

function requireApiKey(): string {
  const value = process.env.ELEVENLABS_API_KEY?.trim();
  if (!value) throw new ElevenLabsProviderError("configuration", 503);
  return value;
}

async function providerFetch(
  operation: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${ELEVENLABS_API_BASE}${path}`,
      {
        ...init,
        headers: {
          "xi-api-key": requireApiKey(),
          ...(init.headers || {}),
        },
      },
      timeoutMs,
    );
  } catch {
    throw new ElevenLabsProviderError(operation, 0);
  }
  if (!response.ok) throw new ElevenLabsProviderError(operation, response.status);
  return response;
}

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export async function getElevenLabsVoice(voiceId: string): Promise<ElevenLabsVoice> {
  const response = await providerFetch("voice lookup", `/voices/${encodeURIComponent(voiceId)}`);
  return (await response.json()) as ElevenLabsVoice;
}

/**
 * The complete ElevenLabs roster accessible to Wireline's configured account.
 * Provider-side catalog additions become available without a deploy. The cache
 * keeps picker loads and live-call assembly from repeatedly spending a catalog
 * request while preserving a bounded refresh window for account changes.
 */
export async function listElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
  if (!elevenLabsConfigured()) return [];
  if (voiceRosterCache && Date.now() - voiceRosterCache.at < VOICE_ROSTER_TTL_MS) {
    return voiceRosterCache.voices;
  }
  const response = await providerFetch("voice roster", "/voices", {}, 10_000);
  const body = (await response.json()) as { voices?: ElevenLabsVoice[] };
  const voices = Array.isArray(body.voices)
    ? body.voices.filter((voice): voice is ElevenLabsVoice =>
        Boolean(voice?.voice_id?.trim() && voice?.name?.trim()),
      )
    : [];
  voiceRosterCache = { at: Date.now(), voices };
  return voices;
}

/**
 * Only shared library voices are selectable by every Wireline workspace.
 * Account-owned clones remain ownership- and review-gated through
 * `wireline_cloned_voices` rather than becoming visible to other tenants.
 */
export async function isElevenLabsLibraryVoiceAvailable(voiceId: string): Promise<boolean> {
  const normalized = voiceId.trim();
  if (!normalized) return false;
  try {
    return (await listElevenLabsVoices()).some(
      (voice) => voice.voice_id === normalized && voice.category !== "cloned",
    );
  } catch {
    // A live call must degrade to its configured Vapi fallback if the library
    // lookup is unavailable after selection; it must not fail the call setup.
    return false;
  }
}

/** Test seam for the process-wide provider roster cache. */
export function resetElevenLabsVoiceRosterCache(): void {
  voiceRosterCache = null;
}

export async function createInstantVoiceClone(args: {
  name: string;
  audioBytes: Buffer;
  audioMimeType: string;
  removeBackgroundNoise: boolean;
}): Promise<{
  voiceId: string;
  requiresVerification: boolean;
  previewUrl: string | null;
}> {
  const form = new FormData();
  const bytes = new Uint8Array(args.audioBytes);
  form.append("name", args.name);
  form.append("description", "Private voice created and governed by Wireline");
  form.append("remove_background_noise", String(args.removeBackgroundNoise));
  form.append(
    "files",
    new Blob([bytes], { type: args.audioMimeType }),
    sampleFilename(args.audioMimeType),
  );

  const response = await providerFetch(
    "instant voice clone",
    "/voices/add",
    { method: "POST", body: form },
    45_000,
  );
  const created = (await response.json()) as {
    voice_id?: string;
    requires_verification?: boolean;
  };
  if (!created.voice_id) throw new ElevenLabsProviderError("instant voice clone", 502);

  let previewUrl: string | null = null;
  try {
    previewUrl = (await getElevenLabsVoice(created.voice_id)).preview_url ?? null;
  } catch {
    // Preview is generated on demand during the mandatory quality review.
  }
  return {
    voiceId: created.voice_id,
    requiresVerification: created.requires_verification === true,
    previewUrl,
  };
}

export type ElevenLabsDubbingRequest = {
  sourceUrl: string;
  targetLanguage: string;
};

/**
 * Start a server-owned dubbing job. The browser sends only a public HTTPS media
 * URL and language target; the ElevenLabs credential remains server-side.
 */
export async function startElevenLabsDubbing(
  request: ElevenLabsDubbingRequest,
): Promise<{ dubbingId: string; expectedDurationSeconds?: number }> {
  const response = await providerFetch(
    "dubbing",
    "/dubbing",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_url: request.sourceUrl,
        target_lang: request.targetLanguage,
      }),
    },
    45_000,
  );
  const created = (await response.json()) as {
    dubbing_id?: string;
    expected_duration_sec?: number;
  };
  if (!created.dubbing_id) throw new ElevenLabsProviderError("dubbing", 502);
  return {
    dubbingId: created.dubbing_id,
    ...(typeof created.expected_duration_sec === "number"
      ? { expectedDurationSeconds: created.expected_duration_sec }
      : {}),
  };
}

export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  try {
    await providerFetch("voice deletion", `/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error instanceof ElevenLabsProviderError && error.status === 404) return;
    throw error;
  }
}

/**
 * Voice-quality proof for the review/audition surface. A thin wrapper over the
 * shared synthesis engine below so the proof a reviewer approves and any other
 * render of the same voice go through one request builder and cannot drift.
 */
export async function generateElevenLabsProof(args: {
  voiceId: string;
  text?: string;
}): Promise<ArrayBuffer> {
  const result = await synthesizeElevenLabsSpeech({
    voiceId: args.voiceId,
    text:
      args.text ||
      "Hi, this is your Wireline agent. I can answer clearly, take action, and bring in a person whenever you need one.",
  });
  return result.audio;
}

/**
 * Output formats Wireline renders.
 *
 * `pcm_24000` is signed 16-bit little-endian at 24 kHz — the stream shape
 * LiveAvatar LITE's audio control consumes. The live stage today lip-syncs
 * Wireline Realtime PCM; this format exists so a future pre-rendered
 * presenter lane needs no resampling stage.
 * `ulaw_8000` is the telephony format; it is listed for completeness and is not
 * used by live PSTN, which renders inside Vapi rather than here.
 */
export type ElevenLabsOutputFormat =
  "mp3_44100_128" | "mp3_44100_192" | "pcm_16000" | "pcm_24000" | "pcm_44100" | "ulaw_8000";

export const ELEVENLABS_LIPSYNC_FORMAT: ElevenLabsOutputFormat = "pcm_24000";
export const ELEVENLABS_LIPSYNC_SAMPLE_RATE = 24_000;

const OUTPUT_FORMAT_MIME: Record<ElevenLabsOutputFormat, string> = {
  mp3_44100_128: "audio/mpeg",
  mp3_44100_192: "audio/mpeg",
  pcm_16000: "audio/pcm",
  pcm_24000: "audio/pcm",
  pcm_44100: "audio/pcm",
  ulaw_8000: "audio/basic",
};

export type ElevenLabsVoiceSettings = {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
};

export type ElevenLabsSpeechRequest = {
  voiceId: string;
  text: string;
  /** Defaults to the low-latency realtime model shared with the call runtime. */
  modelId?: string;
  outputFormat?: ElevenLabsOutputFormat;
  voiceSettings?: ElevenLabsVoiceSettings;
  /** BCP-47 hint; omitted unless supplied so the model auto-detects. */
  languageCode?: string;
  timeoutMs?: number;
};

export type ElevenLabsSpeechResult = {
  audio: ArrayBuffer;
  mimeType: string;
  outputFormat: ElevenLabsOutputFormat;
  modelId: string;
  voiceId: string;
};

function clamp01(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/**
 * Build the synthesis body.
 *
 * Exported so a caller's payload can be asserted without a network round trip.
 * Voice settings mirror the values `buildManagedVoiceRuntime` sends through
 * Vapi, so a presenter render and a phone call reproduce the same voice
 * character rather than drifting into two different-sounding agents.
 */
export function buildElevenLabsSpeechBody(
  request: ElevenLabsSpeechRequest,
): Record<string, unknown> {
  const settings = request.voiceSettings;
  return {
    text: request.text,
    model_id: request.modelId || ELEVENLABS_REALTIME_MODEL,
    voice_settings: {
      stability: clamp01(settings?.stability, 0.5),
      similarity_boost: clamp01(settings?.similarityBoost, 0.75),
      style: clamp01(settings?.style, 0),
      use_speaker_boost: settings?.useSpeakerBoost !== false,
      ...(settings?.speed == null || !Number.isFinite(settings.speed)
        ? {}
        : { speed: Math.min(1.2, Math.max(0.7, settings.speed)) }),
    },
    ...(request.languageCode ? { language_code: request.languageCode } : {}),
  };
}

/**
 * Synthesize speech in an explicit output format.
 *
 * This is the shared engine for presenter lip-sync audio and creative renders.
 * Live PSTN speech is not produced here — Vapi renders ElevenLabs in-call from
 * the voice object built by `buildManagedVoiceRuntime`, so a change here can
 * never alter what a customer hears on a phone call.
 */
export async function synthesizeElevenLabsSpeech(
  request: ElevenLabsSpeechRequest,
): Promise<ElevenLabsSpeechResult> {
  const text = request.text?.trim();
  if (!text) throw new ElevenLabsProviderError("synthesis", 400);
  const voiceId = request.voiceId?.trim();
  if (!voiceId) throw new ElevenLabsProviderError("synthesis", 400);

  const outputFormat = request.outputFormat ?? "mp3_44100_128";
  const modelId = request.modelId || ELEVENLABS_REALTIME_MODEL;
  const response = await providerFetch(
    "synthesis",
    `/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: OUTPUT_FORMAT_MIME[outputFormat],
      },
      body: JSON.stringify(buildElevenLabsSpeechBody({ ...request, text, voiceId, modelId })),
    },
    request.timeoutMs ?? 30_000,
  );

  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0) throw new ElevenLabsProviderError("synthesis", 502);
  return {
    audio,
    mimeType: OUTPUT_FORMAT_MIME[outputFormat],
    outputFormat,
    modelId,
    voiceId,
  };
}

function sampleFilename(mimeType: string): string {
  if (mimeType.includes("wav")) return "voice-sample.wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "voice-sample.m4a";
  if (mimeType.includes("ogg")) return "voice-sample.ogg";
  if (mimeType.includes("webm")) return "voice-sample.webm";
  return "voice-sample.mp3";
}
