/**
 * ElevenLabs API wrapper — typed helpers for voice library + cloning.
 *
 * Why this lives in its own file: the existing voice catalog
 * (PREMIUM_VOICES in FleetSettings.tsx) is static + curated.
 * ElevenLabs is dynamic: every tenant can clone voices, the library
 * grows, voices get deleted. We hit the live API on demand and merge
 * with the curated list at the route layer.
 *
 * The fetch pattern matches the rest of Wireline (native fetch, no
 * SDK dependency — keeps cold-start tiny). All API keys server-side
 * via process.env.ELEVENLABS_API_KEY.
 *
 * Reference: https://elevenlabs.io/docs/api-reference
 */
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const BASE = "https://api.elevenlabs.io/v1";

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: "premade" | "cloned" | "generated" | "professional" | string;
  preview_url?: string | null;
  description?: string | null;
  labels?: Record<string, string>;
}

export interface ListVoicesResponse {
  voices: ElevenLabsVoice[];
}

function apiKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY not set");
  return k;
}

/**
 * List every voice the account can use: premade catalog + this
 * account's cloned voices. ElevenLabs returns both in one response,
 * tagged by `category`. We pass include_preview_urls so the UI can
 * play samples without a second round-trip.
 */
export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const r = await fetch(`${BASE}/voices?show_legacy=false`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs listVoices ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = (await r.json()) as ListVoicesResponse;
  return data.voices ?? [];
}

/**
 * Single voice metadata. Used after cloning to pull the fresh
 * preview_url so the operator hears the cloned voice immediately.
 */
export async function getVoice(voiceId: string): Promise<ElevenLabsVoice> {
  const r = await fetch(`${BASE}/voices/${encodeURIComponent(voiceId)}`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs getVoice ${r.status}: ${body.slice(0, 200)}`);
  }
  return (await r.json()) as ElevenLabsVoice;
}

/**
 * Instant Voice Clone — single sample, returns the cloned voice_id
 * synchronously. Sample is sent as base64 in multipart form because
 * native fetch in Node doesn't have a great File constructor; the
 * easiest cross-platform approach is to pass the raw bytes as a
 * Blob-equivalent.
 */
export async function createInstantClone(args: {
  name: string;
  audioBase64: string;
  audioMimeType?: string;
  description?: string;
}): Promise<ElevenLabsVoice> {
  // ElevenLabs accepts files via multipart/form-data. We construct
  // a FormData with the audio as a Blob. Node >=18 has Blob + FormData
  // global.
  const audioBytes = Buffer.from(args.audioBase64, "base64");
  const blob = new Blob([audioBytes], { type: args.audioMimeType || "audio/mpeg" });
  const form = new FormData();
  form.append("name", args.name);
  if (args.description) form.append("description", args.description);
  form.append("files", blob, sampleFilename(args.audioMimeType));

  const r = await fetch(`${BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs clone ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = (await r.json()) as { voice_id: string };
  // Pull full metadata so the UI gets the preview_url immediately.
  try {
    return await getVoice(data.voice_id);
  } catch (e) {
    log.warn("ElevenLabs getVoice after clone failed — returning shell", {
      error: getErrorMessage(e),
    });
    return { voice_id: data.voice_id, name: args.name, category: "cloned" };
  }
}

/**
 * Delete a cloned voice. Premade voices return an error (we don't
 * proxy that — the route guards by checking ownership in our DB
 * before calling delete).
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const r = await fetch(`${BASE}/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey() },
  });
  if (!r.ok && r.status !== 404) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs delete ${r.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Generate a short TTS sample so a freshly-cloned voice has a
 * playable preview even before ElevenLabs's own preview_url is
 * populated. Returns the audio as ArrayBuffer so the route layer
 * can stream or persist it.
 */
export async function generateSample(args: {
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<ArrayBuffer> {
  const r = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(args.voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: args.text,
      model_id: args.modelId || "eleven_turbo_v2_5",
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${r.status}: ${body.slice(0, 200)}`);
  }
  return await r.arrayBuffer();
}

function sampleFilename(mime?: string): string {
  switch (mime) {
    case "audio/wav":
      return "sample.wav";
    case "audio/m4a":
    case "audio/mp4":
      return "sample.m4a";
    case "audio/ogg":
      return "sample.ogg";
    default:
      return "sample.mp3";
  }
}

export function elevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

/**
 * Voice Isolator — strip background noise from an audio sample before
 * we send it to the clone endpoint. Game-changer for clone quality:
 * the cleaner the input, the better the cloned voice. Operators record
 * on phones / in cafes / with kids in the background; isolator gets
 * us a studio-quality input from a real-world one.
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/voice-isolator
 *
 * Returns the cleaned audio as an ArrayBuffer (MP3). The caller can
 * either re-encode + pass to createInstantClone(), or persist for
 * later. ~$0.005 per call (cheap).
 */
export async function isolateVoice(audioBase64: string, mimeType?: string): Promise<ArrayBuffer> {
  const bytes = Buffer.from(audioBase64, "base64");
  const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
  const form = new FormData();
  form.append("audio", blob, sampleFilename(mimeType));

  const r = await fetch(`${BASE}/audio-isolation`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs isolate ${r.status}: ${body.slice(0, 200)}`);
  }
  return await r.arrayBuffer();
}

/**
 * Speech-to-Text — re-transcribe a call recording with ElevenLabs's
 * Scribe model. We already get Vapi-side transcripts but Scribe is
 * a notch more accurate on accented English + noisy lines. Use for
 * post-call QA or compliance review when Vapi's transcript looks
 * questionable.
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-to-text
 *
 * Returns the transcript text (single string). ~$0.40/hr of audio.
 */
export async function transcribeAudio(audioBase64: string, mimeType?: string): Promise<string> {
  const bytes = Buffer.from(audioBase64, "base64");
  const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
  const form = new FormData();
  form.append("file", blob, sampleFilename(mimeType));
  form.append("model_id", "scribe_v1");

  const r = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs STT ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = (await r.json()) as { text?: string };
  return data.text || "";
}
