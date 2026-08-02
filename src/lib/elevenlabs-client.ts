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
  if (!response.ok)
    throw new ElevenLabsProviderError(operation, response.status);
  return response;
}

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export async function getElevenLabsVoice(
  voiceId: string,
): Promise<ElevenLabsVoice> {
  const response = await providerFetch(
    "voice lookup",
    `/voices/${encodeURIComponent(voiceId)}`,
  );
  return (await response.json()) as ElevenLabsVoice;
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
  if (!created.voice_id)
    throw new ElevenLabsProviderError("instant voice clone", 502);

  let previewUrl: string | null = null;
  try {
    previewUrl =
      (await getElevenLabsVoice(created.voice_id)).preview_url ?? null;
  } catch {
    // Preview is generated on demand during the mandatory quality review.
  }
  return {
    voiceId: created.voice_id,
    requiresVerification: created.requires_verification === true,
    previewUrl,
  };
}

export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  try {
    await providerFetch(
      "voice deletion",
      `/voices/${encodeURIComponent(voiceId)}`,
      {
        method: "DELETE",
      },
    );
  } catch (error) {
    if (error instanceof ElevenLabsProviderError && error.status === 404)
      return;
    throw error;
  }
}

export async function generateElevenLabsProof(args: {
  voiceId: string;
  text?: string;
}): Promise<ArrayBuffer> {
  const response = await providerFetch(
    "quality proof",
    `/text-to-speech/${encodeURIComponent(args.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text:
          args.text ||
          "Hi, this is your Wireline agent. I can answer clearly, take action, and bring in a person whenever you need one.",
        model_id: ELEVENLABS_REALTIME_MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      }),
    },
    30_000,
  );
  return response.arrayBuffer();
}

function sampleFilename(mimeType: string): string {
  if (mimeType.includes("wav")) return "voice-sample.wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a"))
    return "voice-sample.m4a";
  if (mimeType.includes("ogg")) return "voice-sample.ogg";
  if (mimeType.includes("webm")) return "voice-sample.webm";
  return "voice-sample.mp3";
}
