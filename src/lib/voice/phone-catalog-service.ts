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

function publicPreviewUrl(value: unknown, voiceId: string): string | undefined {
  const raw = text(value, 8192);
  if (!URL.canParse(raw)) return;
  const url = new URL(raw);
  if (url.username || url.password || url.protocol !== "https:" || url.port) return;
  if (url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/eleven-public-prod/"))
    return url.href;
  const previewHosts = ["api.elevenlabs.io", "api.us.elevenlabs.io", "api.eu.elevenlabs.io"];
  if (
    previewHosts.includes(url.hostname) &&
    url.pathname === `/v1/voices/${voiceId}/previews/audio`
  )
    return url.href;
}

function publicLibraryVoice(row: JsonRecord): CatalogPhoneVoice | null {
  const id = text(row.voice_id, 80);
  const ownerId = text(row.public_owner_id, 128);
  const listingName = text(row.name, 240);
  if (!/^[a-zA-Z0-9-]{10,80}$/.test(id) || !/^[a-zA-Z0-9_-]{10,128}$/.test(ownerId) || !listingName)
    return null;
  const gender = text(row.gender, 30).toLowerCase();
  const previewUrl = publicPreviewUrl(row.preview_url, id);
  return {
    provider: "elevenlabs",
    id,
    name: listingName,
    language: text(row.language, 20),
    gender: gender === "female" || gender === "male" ? gender : null,
    library: {
      ownerId,
      listingName,
      ...(previewUrl ? { previewUrl } : {}),
    },
  };
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
  async function libraryPage(search: string, page: number, ownerId?: string, standardOnly = false) {
    const credential = key("elevenlabs");
    if (!credential) throw new Error("ElevenLabs is unavailable");
    const url = new URL("https://api.elevenlabs.io/v1/shared-voices");
    url.searchParams.set("page_size", ownerId ? "100" : "24");
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "trending");
    if (search) url.searchParams.set("search", search);
    if (ownerId) url.searchParams.set("owner_id", ownerId);
    url.searchParams.set("include_custom_rates", String(!standardOnly));
    const response = await request(url, {
      headers: { "xi-api-key": credential },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const result = record(JSON.parse((await boundedAudio(response)).toString("utf8")));
    if (!Array.isArray(result.voices)) throw new Error("Invalid ElevenLabs library response");
    const voices = result.voices.flatMap((item) => {
      const voice = publicLibraryVoice(record(item));
      return voice ? [voice] : [];
    });
    return { voices, hasMore: result.has_more === true };
  }

  async function activate(value: unknown) {
    const input = record(value);
    const library = record(input.library);
    const variables = { botboundPhoneCatalogVoice: input };
    if (input.provider !== "elevenlabs" || !input.library) return resolve(variables);
    if (!catalogVoiceSelection(variables)) return null;
    const ownerId = text(library.ownerId, 128);
    const name = text(library.listingName, 240);
    if (!/^[a-zA-Z0-9_-]{10,128}$/.test(ownerId) || !name) return null;
    // Recheck the provider listing on selection. A submitted name or owner is never proof of public access.
    const page = await libraryPage(name, 0, ownerId, true);
    const listed = page.voices.find(
      (voice) => voice.id === input.id && voice.library?.ownerId === ownerId,
    );
    if (!listed) return null;
    const existing = await resolve(variables);
    if (existing) return existing;
    const response = await request(
      `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(ownerId)}/${encodeURIComponent(listed.id)}`,
      {
        method: "POST",
        headers: { "xi-api-key": key("elevenlabs"), "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: listed.name }),
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      },
    );
    // A concurrent selection may have added the same voice first.
    if (!response.ok) {
      await response.body?.cancel();
      return resolve(variables);
    }
    const added = record(JSON.parse((await boundedAudio(response)).toString("utf8")));
    return resolve({ botboundPhoneCatalogVoice: { provider: "elevenlabs", id: added.voice_id } });
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
      const stock = saved.voices.find((voice) => voice.id === selection.id);
      if (stock || selection.provider === "cartesia") return stock ?? null;
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
      let voice =
        parsePublicCatalog(
          selection.provider,
          selection.provider === "cartesia" ? { data: [row] } : { voices: [row] },
        ).find((voice) => voice.id === selection.id) ?? null;
      if (!voice && selection.provider === "elevenlabs" && row.voice_id === selection.id) {
        // An imported voice must still be publicly listed and available at standard rates.
        const sharing = record(row.sharing);
        if (sharing.status !== "enabled" || sharing.enabled_in_library !== true) return null;
        const ownerId = text(sharing.public_owner_id, 128);
        const name = text(sharing.name || row.name, 240);
        if (!/^[a-zA-Z0-9_-]{10,128}$/.test(ownerId) || !name) return null;
        const url = new URL("https://api.elevenlabs.io/v2/voices");
        url.searchParams.set("voice_ids", selection.id);
        url.searchParams.set("include_custom_rates", "false");
        url.searchParams.set("include_total_count", "false");
        const membership = await request(url, {
          headers: { "xi-api-key": credential },
          redirect: "error",
          signal: AbortSignal.timeout(3000),
        });
        const result = record(JSON.parse((await boundedAudio(membership)).toString("utf8")));
        if (
          Array.isArray(result.voices) &&
          result.voices.some((item) => record(item).voice_id === selection.id)
        ) {
          voice = publicLibraryVoice({
            ...record(row.labels),
            name,
            voice_id: selection.id,
            public_owner_id: ownerId,
            preview_url: row.preview_url,
          });
        }
      }
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
  return { list, all, resolve, preview, libraryPage, activate };
}

export const phoneCatalogService = createPhoneCatalogService();
