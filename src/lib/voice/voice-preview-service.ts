/** Exact server-side previews for Wireline Live voices. */
import { AppError } from "../api-error";
import { VAPI_CURATED_VOICES, WIRELINE_LIVE_VOICES } from "../voice-catalog";

export const CURATED_VOICE_PREVIEW_TEXT = "Hello, this is {name}. How can I help you today?";

const XAI_TTS_URL = "https://api.x.ai/v1/tts";
const XAI_VOICE_IDS = new Set(WIRELINE_LIVE_VOICES.map((voice) => voice.id));
const VAPI_SAMPLE_HOST = "files.buildwithfern.com";
const VAPI_VOICE_SAMPLE_URLS: Readonly<Record<string, string>> = Object.freeze({
  Elliot:
    "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/6e6a3eb414a7a5106bc12283145f4194b575e9e5e05d6dd9d19a3fcf0d605c4a/static/audio/elliot-sample.wav",
  Savannah:
    "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/2e546c5711500d4c0548915e43f77c45895ea42d618e3b09ac8ee58856e6dae9/static/audio/savannah-sample.wav",
  Emma: "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/ee8e5dcf268c4fd3b6f86f5f8503ae11e916367557b3d4593b7f487ec45e6334/static/audio/emma-sample.wav",
  Clara:
    "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/d0f1810c2ef5186aa9075ac7546ae2d49ce4507627100d221ede6c85fbfc45d9/static/audio/clara-sample.wav",
  Nico: "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/bf1f929013379c371e550702265de63dabe2a16b01be4f89134eccd4c5fe5b34/static/audio/nico-sample.wav",
  Kai: "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/e62bcc299bdd414e2257a7cda62663091c53f90c641da4288fc2dcd2771c2f08/static/audio/kai-sample.wav",
  Sagar:
    "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/770911e139956350b56bbac1a69c87df05126f9a1395f86b31837b85e3919139/static/audio/sagar-sample.wav",
  Godfrey:
    "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/0f09df2fd8cd5ddd7a58e9caee5c7af21863c81ffa97ed540ab3d5f2350afbbc/static/audio/godfrey-sample.wav",
  Neil: "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/5e65d608cd838affdb8df10f1dad412ef4746dac06570e1fc1032158107ac151/static/audio/neil-sample.wav",
  Layla:
    "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/e3e3addbe31e154ff798dc7cc76da2aef89c0259205bd39e3f381328326fa65e/static/audio/layla-sample.wav",
  Sid: "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/4dd45977cf6ed2b446fda04a3e1e4ed7e15c8c158d924050bfbdec7b79852a22/static/audio/sid-sample.wav",
  Naina:
    "https://files.buildwithfern.com/vapi.docs.buildwithfern.com/a83ecbb1757b4a341bb568cfd0185230af23c8da97215c0304c907870e51af43/static/audio/naina-sample.wav",
});
const PINNED_VAPI_SAMPLE_URLS = new Set(Object.values(VAPI_VOICE_SAMPLE_URLS));
// Leave headroom beneath the serverless response ceiling; the largest pinned sample is ~3.5 MiB.
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 15_000;
const VAPI_AUDIO_TYPES = new Set(["audio/wave", "audio/wav", "audio/x-wav"]);
const XAI_AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3"]);

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type CuratedPreviewProvider = "xai" | "vapi";

export function curatedVoicePreviewPath(provider: CuratedPreviewProvider, voiceId: string): string {
  const params = new URLSearchParams({ provider, voiceId });
  return `/api/voices/curated/preview?${params.toString()}`;
}

function resolveDisplayName(provider: CuratedPreviewProvider, voiceId: string): string {
  const pool = provider === "xai" ? WIRELINE_LIVE_VOICES : VAPI_CURATED_VOICES;
  const match = pool.find((voice) => voice.id === voiceId);
  if (!match) return voiceId;
  return match.name.split(" — ")[0]?.trim() || match.name;
}

export function isCuratedPreviewProvider(value: string): value is CuratedPreviewProvider {
  return value === "xai" || value === "vapi";
}

export function curatedVoicePreviewContentType(provider: CuratedPreviewProvider): string {
  return provider === "vapi" ? "audio/wave" : "audio/mpeg";
}

function assertPinnedVapiSampleUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw AppError.fromHttpStatus(404, "Voice preview not available for this selection.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== VAPI_SAMPLE_HOST ||
    url.port ||
    url.username ||
    url.password ||
    !PINNED_VAPI_SAMPLE_URLS.has(url.toString())
  ) {
    throw AppError.fromHttpStatus(404, "Voice preview not available for this selection.");
  }
  return url;
}

function vapiVoiceSampleUrl(voiceId: string): string | null {
  const canonicalVoice = VAPI_CURATED_VOICES.find(
    (voice) => voice.id.toLowerCase() === voiceId.trim().toLowerCase(),
  );
  return canonicalVoice ? (VAPI_VOICE_SAMPLE_URLS[canonicalVoice.id] ?? null) : null;
}

function assertContentLength(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PREVIEW_BYTES) {
    throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
  }
}

function normalizedContentType(response: Response): string {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || "";
}

function isWaveFile(audio: ArrayBuffer): boolean {
  if (audio.byteLength < 12) return false;
  const bytes = new Uint8Array(audio, 0, 12);
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

async function readValidatedAudio(response: Response, provider: CuratedPreviewProvider) {
  if (!response.ok) {
    throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
  }
  assertContentLength(response);
  const contentType = normalizedContentType(response);
  const allowedTypes = provider === "vapi" ? VAPI_AUDIO_TYPES : XAI_AUDIO_TYPES;
  if (!allowedTypes.has(contentType)) {
    throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
  }
  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0 || audio.byteLength > MAX_PREVIEW_BYTES) {
    throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
  }
  if (provider === "vapi" && !isWaveFile(audio)) {
    throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
  }
  return audio;
}

/**
 * Return an exact sample of the selected voice. Wireline Live samples are
 * generated with xAI; Vapi samples are fetched from version-pinned assets on
 * Vapi's official docs. No client-supplied media URL is ever requested.
 */
export async function generateCuratedVoicePreview(
  provider: CuratedPreviewProvider,
  voiceId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

  try {
    if (provider === "vapi") {
      const sampleUrl = vapiVoiceSampleUrl(voiceId);
      if (!sampleUrl) {
        throw AppError.fromHttpStatus(404, "Voice preview not available for this selection.");
      }
      const pinnedUrl = assertPinnedVapiSampleUrl(sampleUrl);
      const response = await fetchImpl(pinnedUrl, {
        method: "GET",
        headers: { Accept: "audio/wave,audio/wav;q=0.9" },
        redirect: "error",
        signal: controller.signal,
      });
      return await readValidatedAudio(response, provider);
    }

    const normalizedVoiceId = voiceId.trim().toLowerCase();
    if (!XAI_VOICE_IDS.has(normalizedVoiceId)) {
      throw AppError.fromHttpStatus(404, "Voice preview not available for this selection.");
    }
    const apiKey = process.env.XAI_API_KEY?.trim();
    if (!apiKey) {
      throw AppError.fromHttpStatus(503, "Voice previews unavailable.");
    }
    const displayName = resolveDisplayName(provider, normalizedVoiceId);
    const text = CURATED_VOICE_PREVIEW_TEXT.replace("{name}", displayName);
    const response = await fetchImpl(XAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        voice_id: normalizedVoiceId,
        language: "en",
      }),
      signal: controller.signal,
    });
    return await readValidatedAudio(response, provider);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.fromHttpStatus(503, "Voice preview is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}
