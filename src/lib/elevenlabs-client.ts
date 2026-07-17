/**
 * ElevenLabs API wrapper — typed helpers for voice library + cloning.
 *
 * Why this lives in its own file: the curated managed voice catalog
 * (VAPI_CURATED_VOICES in src/lib/voice-catalog.ts) is static.
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
 * preview_url so the Account Holder hears the cloned voice immediately.
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

/**
 * PCM 16-bit 24 kHz — required by LiveAvatar LITE lip-sync WebSocket.
 */
export async function generateSamplePcm24(args: {
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<ArrayBuffer> {
  const r = await fetch(
    `${BASE}/text-to-speech/${encodeURIComponent(args.voiceId)}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey(),
        "Content-Type": "application/json",
        Accept: "audio/pcm",
      },
      body: JSON.stringify({
        text: args.text,
        model_id: args.modelId || "eleven_turbo_v2_5",
      }),
    },
  );
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
 * the cleaner the input, the better the cloned voice. Account Holders record
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
 * Pronunciation Dictionary rule shape that the ElevenLabs API expects.
 * "alias" replaces one written form with another spelled-out form
 * ("HVAC" → "H-V-A-C"). "phoneme" replaces the source with an IPA
 * phoneme string ("ACL" → "ˈeɪ siː ɛl"), giving account holders in
 * regulated verticals (medical / legal) precise control over how
 * jargon is voiced.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/pronunciation-dictionary
 */
export interface PronunciationRule {
  string_to_replace: string;
  type: "alias" | "phoneme";
  /** For alias rules. */
  alias?: string;
  /** For phoneme rules — IPA by default. */
  phoneme?: string;
  /** Only relevant for phoneme rules; ElevenLabs defaults to "ipa". */
  alphabet?: "ipa" | "cmu-arpabet";
}

export interface PronunciationDictionaryResult {
  /** ElevenLabs's stable ID for the dictionary. */
  id: string;
  /** Latest version_id — every edit produces a new version on EL's side. */
  version_id: string;
  name?: string;
}

/**
 * Create a pronunciation dictionary on ElevenLabs from a list of rules.
 * The dictionary is account-scoped (any voice on this API key can use
 * it). We then attach the resulting (dictionary_id, version_id) pair
 * to Vapi assistants via voice.eleven_labs.pronunciation_dictionary_locators
 * so it applies during call playback.
 *
 * Docs:
 *   https://elevenlabs.io/docs/eleven-agents/customization/voice/pronunciation-dictionary
 *   https://elevenlabs.io/docs/api-reference/pronunciation-dictionary/add-from-rules
 */
export async function createPronunciationDictionary(args: {
  name: string;
  rules: PronunciationRule[];
  description?: string;
}): Promise<PronunciationDictionaryResult> {
  const body: Record<string, unknown> = {
    name: args.name,
    rules: args.rules,
  };
  if (args.description) body.description = args.description;

  const r = await fetch(`${BASE}/pronunciation-dictionaries/add-from-rules`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`ElevenLabs createPronunciationDictionary ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = (await r.json()) as {
    id: string;
    version_id: string;
    name?: string;
  };
  return { id: data.id, version_id: data.version_id, name: data.name };
}

/**
 * Add (append) more rules to an existing dictionary. ElevenLabs treats
 * every add as a new version — the returned version_id replaces what
 * we had stored. We use this for incremental edits when the Account Holder
 * doesn't want to recreate the whole dictionary.
 *
 * Note: ElevenLabs has no "replace all rules" endpoint. For full
 * replacement semantics, delete + recreate via createPronunciationDictionary.
 */
export async function addRulesToPronunciationDictionary(args: {
  dictionaryId: string;
  rules: PronunciationRule[];
}): Promise<PronunciationDictionaryResult> {
  const r = await fetch(
    `${BASE}/pronunciation-dictionaries/${encodeURIComponent(args.dictionaryId)}/add-rules`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ rules: args.rules }),
    },
  );
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`ElevenLabs addRules ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = (await r.json()) as { id: string; version_id: string; name?: string };
  return { id: data.id, version_id: data.version_id, name: data.name };
}

/**
 * Delete an ElevenLabs-side dictionary. 404s are swallowed: an
 * already-gone dictionary is the desired terminal state. Used when
 * we recreate a dictionary on edit (no "replace" endpoint exists).
 */
export async function deletePronunciationDictionary(dictionaryId: string): Promise<void> {
  const r = await fetch(`${BASE}/pronunciation-dictionaries/${encodeURIComponent(dictionaryId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey() },
  });
  if (!r.ok && r.status !== 404) {
    const text = await r.text().catch(() => "");
    throw new Error(`ElevenLabs deletePronunciationDictionary ${r.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Text-to-Dialogue — generate a multi-speaker conversational audio
 * clip from an ordered list of (voice_id, text) pairs. ElevenLabs's
 * dialogue model stitches the lines into a single MP3 with natural
 * turn-taking + prosody (pauses between speakers, conversational
 * intonation), which is far better than rendering each line via
 * `generateSample` and concatenating manually.
 *
 * Used by the marketing landing-page demo audio: Mike curls the
 * owner-gated `/api/admin/generate-dialogue-sample` endpoint to refresh
 * the embedded sample whenever we change voices or scripts.
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/text-to-dialogue
 *
 * Returns the audio bytes as ArrayBuffer (audio/mpeg).
 */
export async function composeDialogue(args: {
  inputs: { voice_id: string; text: string }[];
  modelId?: string;
}): Promise<ArrayBuffer> {
  if (!args.inputs?.length) {
    throw new Error("composeDialogue: at least one line required");
  }
  const r = await fetch(`${BASE}/text-to-dialogue`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      inputs: args.inputs,
      model_id: args.modelId || "eleven_v3",
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`ElevenLabs text-to-dialogue ${r.status}: ${body.slice(0, 200)}`);
  }
  return await r.arrayBuffer();
}

/**
 * Sound Effects — generate a short MP3 from a text prompt (think
 * "soft warm ambient lounge piano" or "two-note ascending chime").
 * Powers the brand audio library under /public/sounds/: hold music,
 * transfer chime, end-call sting, notification bell. Mike refreshes
 * the set via the owner-gated `/api/admin/generate-brand-sounds`
 * endpoint so the platform owns its sonic identity rather than
 * leaning on generic stock cues.
 *
 * `duration_seconds` is optional (1–22 sec range; ElevenLabs picks
 * a sensible length when omitted). `prompt_influence` (0–1) trades
 * variety for prompt-fidelity; we default to 0.3 because the docs
 * recommend it as the sweet spot for naturalistic results.
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/sound-effects
 *
 * Returns MP3 audio as ArrayBuffer. ~$0.08 per generation.
 */
export async function generateSoundEffect(args: {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
}): Promise<ArrayBuffer> {
  if (!args.text?.trim()) {
    throw new Error("generateSoundEffect: text prompt required");
  }
  const body: Record<string, unknown> = {
    text: args.text,
    prompt_influence: typeof args.promptInfluence === "number" ? args.promptInfluence : 0.3,
  };
  if (typeof args.durationSeconds === "number") {
    body.duration_seconds = args.durationSeconds;
  }
  const r = await fetch(`${BASE}/sound-generation`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new Error(`ElevenLabs sound-generation ${r.status}: ${errBody.slice(0, 200)}`);
  }
  return await r.arrayBuffer();
}

/**
 * Music compose — generate a short song / jingle from a text prompt.
 *
 * Powers the "Singing Receptionist" demo on /showcase: a pre-baked
 * MP3 plays the moment the prospect clicks Play, then the regular
 * agent "catches itself" in its firstMessage. The same helper can
 * render tenant-specific branded jingles (hold music, voicemail
 * outros) so it lives next to composeDialogue + generateSoundEffect
 * rather than being inlined in the route layer.
 *
 * Docs: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music
 * API:  POST /v1/music?output_format=...
 *
 * Response is binary audio (MP3 by default) — NOT async polling.
 * The endpoint blocks until the song is rendered (typically 5-15s
 * for an 8-second clip), then streams the bytes. We return an
 * ArrayBuffer so the caller can either persist to disk (one-time
 * pre-bake) or stream straight to the browser.
 *
 * Pricing roughly $0.02/sec at the time of writing; an 8s jingle
 * ≈ $0.16. Pre-bake once + serve from /public/sounds so we never
 * pay per call. Regenerate locally with scripts/generate-jingle.mjs
 * and commit the reviewed MP3.
 */
export async function composeMusic(args: {
  prompt: string;
  /** Length in ms. ElevenLabs allows 3000-600000. Default 8000 — matches our jingle target. */
  musicLengthMs?: number;
  /** Default music_v1 — the only generally-available music model right now. */
  modelId?: string;
  /** Output codec. Default mp3_44100_128 (telephony-safe + good fidelity). */
  outputFormat?: "mp3_44100_128" | "mp3_44100_192" | "pcm_44100";
  /** Pin generation for reproducibility — handy when iterating on a jingle. */
  seed?: number;
  /** Force purely instrumental output (no lyrics). Default false — we WANT vocals. */
  forceInstrumental?: boolean;
}): Promise<ArrayBuffer> {
  const outputFormat = args.outputFormat || "mp3_44100_128";
  const url = `${BASE}/music?output_format=${encodeURIComponent(outputFormat)}`;
  const body: Record<string, unknown> = {
    prompt: args.prompt,
    music_length_ms: args.musicLengthMs ?? 8000,
    model_id: args.modelId || "music_v1",
  };
  if (typeof args.seed === "number") body.seed = args.seed;
  if (args.forceInstrumental) body.force_instrumental = true;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`ElevenLabs music compose ${r.status}: ${errText.slice(0, 300)}`);
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
