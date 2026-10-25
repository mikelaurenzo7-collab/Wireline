import { createHash } from "node:crypto";
import {
  type CatalogPhoneVoice,
  type CatalogVoiceProvider,
  catalogVoiceSelection,
} from "../phone-voice-catalog";
import { ELEVENLABS_SPEECH_MODEL, ELEVENLABS_SPEECH_SETTINGS } from "./elevenlabs-speech-settings";

export const CARTESIA_API_VERSION = "2026-08-14";
export const CARTESIA_SPEECH_MODEL = "sonic-3.6";
const MAX_RESPONSE_BYTES = 2_000_000;
const CACHE_MS = 5 * 60_000;
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Only public provider voices cross this boundary; workspace clones never do. */
export function parsePublicCatalog(
  provider: CatalogVoiceProvider,
  body: unknown,
): CatalogPhoneVoice[] {
  const rows = record(body)[provider === "cartesia" ? "data" : "voices"];
  if (!Array.isArray(rows)) throw new Error("Invalid voice catalog");
  return rows.flatMap((item) => {
    const row = record(item);
    if (
      provider === "cartesia" &&
      (row.access !== "public" || row.status !== "active" || row.is_owner !== false)
    )
      return [];
    if (provider === "elevenlabs" && row.category !== "premade") return [];
    const id = text(provider === "cartesia" ? row.id : row.voice_id, 80);
    const name = text(row.name, 80).split(" - ")[0].trim();
    if (!/^[a-zA-Z0-9-]{10,80}$/.test(id) || !name) return [];
    const labels = record(row.labels);
    const rawGender = provider === "cartesia" ? row.gender : labels.gender;
    const gender =
      rawGender === "female" || rawGender === "feminine"
        ? "female"
        : rawGender === "male" || rawGender === "masculine"
          ? "male"
          : null;
    return [
      { id, provider, name, language: text(row.language ?? labels.language, 20) || "en", gender },
    ];
  });
}

export async function boundedAudio(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<Buffer> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Voice provider HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > maxBytes) throw new Error("Voice response exceeded its limit");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!size) throw new Error("Voice response was empty");
  return Buffer.concat(chunks);
}

export function createPhoneCatalogService(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
) {
  const cache = new Map<
    CatalogVoiceProvider,
    { fingerprint: string; expires: number; voices: CatalogPhoneVoice[] }
  >();
  const pending = new Map<CatalogVoiceProvider, Promise<CatalogPhoneVoice[]>>();
  const selectedCache = new Map<string, { expires: number; voice: CatalogPhoneVoice }>();
  const key = (provider: CatalogVoiceProvider) =>
    String(
      provider === "cartesia" ? env.CARTESIA_API_KEY || "" : env.ELEVENLABS_API_KEY || "",
    ).trim();
  async function list(provider: CatalogVoiceProvider): Promise<CatalogPhoneVoice[]> {
    const credential = key(provider);
    if (!credential) return [];
    const fingerprint = createHash("sha256").update(credential).digest("hex");
    const saved = cache.get(provider);
    if (saved?.fingerprint === fingerprint && saved.expires > Date.now()) return saved.voices;
    const inFlight = pending.get(provider);
    if (inFlight) return inFlight;
    const load = (async () => {
      const voices: CatalogPhoneVoice[] = [];
      let cursor = "";
      // Bound the inventory request and never silently advertise a private voice.
      for (let page = 0; page < 5; page += 1) {
        const url =
          provider === "cartesia"
            ? new URL("https://api.cartesia.ai/voices?limit=100&is_owner=false")
            : new URL(
                "https://api.elevenlabs.io/v2/voices?voice_type=default&category=premade&page_size=100&include_custom_rates=false",
              );
        if (cursor)
          url.searchParams.set(
            provider === "cartesia" ? "starting_after" : "next_page_token",
            cursor,
          );
        const response = await request(url, {
          headers:
            provider === "cartesia"
              ? { Authorization: `Bearer ${credential}`, "Cartesia-Version": CARTESIA_API_VERSION }
              : { "xi-api-key": credential },
          signal: AbortSignal.timeout(8_000),
          redirect: "error",
        });
        const body = record(JSON.parse((await boundedAudio(response)).toString("utf8")));
        voices.push(...parsePublicCatalog(provider, body));
        if (body.has_more !== true) break;
        const rows = provider === "cartesia" && Array.isArray(body.data) ? body.data : [];
        const next =
          provider === "cartesia"
            ? text(record(rows.at(-1)).id, 80)
            : text(body.next_page_token, 500);
        if (!next || next === cursor) break;
        cursor = next;
      }
      const unique = [...new Map(voices.map((voice) => [voice.id, voice])).values()];
      cache.set(provider, { fingerprint, expires: Date.now() + CACHE_MS, voices: unique });
      return unique;
    })();
    pending.set(provider, load);
    try {
      return await load;
    } finally {
      pending.delete(provider);
    }
  }
  async function all() {
    const providers: CatalogVoiceProvider[] = ["cartesia", "elevenlabs"];
    const results = await Promise.allSettled(providers.map(list));
    return {
      voices: results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
      unavailable: results.flatMap((result, index) =>
        result.status === "rejected" ? [providers[index]] : [],
      ),
    };
  }
  async function resolve(variables: unknown): Promise<CatalogPhoneVoice | null> {
    const selection = catalogVoiceSelection(variables);
    if (!selection) return null;
    const credential = key(selection.provider);
    if (!credential) return null;
    const fingerprint = createHash("sha256").update(credential).digest("hex");
    const selectedKey = `${selection.provider}:${selection.id}:${fingerprint}`;
    const selected = selectedCache.get(selectedKey);
    if (selected && selected.expires > Date.now()) return selected.voice;
    const saved = cache.get(selection.provider);
    if (saved?.fingerprint === fingerprint && saved.expires > Date.now()) {
      return saved.voices.find((voice) => voice.id === selection.id) ?? null;
    }
    try {
      // A cold phone worker checks one selected voice, never scans the library
      // while a caller is waiting for the opening words.
      const response = await request(
        selection.provider === "cartesia"
          ? `https://api.cartesia.ai/voices/${encodeURIComponent(selection.id)}`
          : `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(selection.id)}`,
        {
          headers:
            selection.provider === "cartesia"
              ? { Authorization: `Bearer ${credential}`, "Cartesia-Version": CARTESIA_API_VERSION }
              : { "xi-api-key": credential },
          signal: AbortSignal.timeout(3_000),
          redirect: "error",
        },
      );
      const row = JSON.parse((await boundedAudio(response)).toString("utf8"));
      const voice =
        parsePublicCatalog(
          selection.provider,
          selection.provider === "cartesia" ? { data: [row] } : { voices: [row] },
        ).find((voice) => voice.id === selection.id) ?? null;
      if (voice) {
        selectedCache.set(selectedKey, { expires: Date.now() + CACHE_MS, voice });
        if (selectedCache.size > 512) selectedCache.delete(selectedCache.keys().next().value!);
      }
      return voice;
    } catch {
      return null;
    }
  }
  async function preview(
    voice: CatalogPhoneVoice,
    line: string,
  ): Promise<{ audio: Buffer; mime: string }> {
    const response = await request(
      voice.provider === "cartesia"
        ? "https://api.cartesia.ai/tts/bytes"
        : `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.id)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers:
          voice.provider === "cartesia"
            ? {
                Authorization: `Bearer ${key(voice.provider)}`,
                "Cartesia-Version": CARTESIA_API_VERSION,
                "Content-Type": "application/json",
              }
            : { "xi-api-key": key(voice.provider), "Content-Type": "application/json" },
        body: JSON.stringify(
          voice.provider === "cartesia"
            ? {
                model_id: CARTESIA_SPEECH_MODEL,
                transcript: line,
                voice: voice.id,
                output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 24000 },
              }
            : {
                text: line,
                model_id: ELEVENLABS_SPEECH_MODEL,
                voice_settings: ELEVENLABS_SPEECH_SETTINGS,
              },
        ),
      },
    );
    return {
      audio: await boundedAudio(response),
      mime: voice.provider === "cartesia" ? "audio/wav" : "audio/mpeg",
    };
  }
  return { list, all, resolve, preview };
}

export const phoneCatalogService = createPhoneCatalogService();
