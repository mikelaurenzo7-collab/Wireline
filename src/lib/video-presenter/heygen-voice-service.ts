/**
 * HeyGen presenter voices — public catalog + avatar default voice matching.
 *
 * LiveAvatar handles faces; HeyGen v3 Voices API supplies lip-sync-aligned
 * voice IDs and preview_audio_url samples for the create flow.
 */
import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";

const HEYGEN_API_BASE = "https://api.heygen.com";

const TRUSTED_HEYGEN_MEDIA_HOSTS = new Set([
  "heygen.ai",
  "files.heygen.ai",
  "resource.heygen.ai",
  "static.heygen.ai",
]);

function isTrustedHeyGenMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (TRUSTED_HEYGEN_MEDIA_HOSTS.has(host)) return true;
    return host.endsWith(".heygen.ai") || host.endsWith(".heygen.com");
  } catch {
    return false;
  }
}

export function assertTrustedHeyGenMediaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || !isTrustedHeyGenMediaUrl(trimmed)) {
    throw AppError.fromHttpStatus(502, "Untrusted presenter media URL.");
  }
  return trimmed;
}

export type PresenterVoice = {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  preview_audio_url?: string | null;
};

type HeyGenListResponse = {
  data?: PresenterVoiceApiRow[];
  has_more?: boolean;
  next_token?: string | null;
};

type PresenterVoiceApiRow = {
  voice_id?: string;
  name?: string;
  language?: string;
  gender?: string;
  preview_audio_url?: string | null;
};

type HeyGenVoiceResponse = {
  data?: PresenterVoiceApiRow;
};

type HeyGenLookResponse = {
  data?: {
    id?: string;
    default_voice_id?: string | null;
    name?: string;
  };
};

let voiceCache: { at: number; voices: PresenterVoice[] } | null = null;
const VOICE_CACHE_TTL_MS = 60 * 60 * 1000;

function heygenApiKey(): string | null {
  return process.env.HEYGEN_API_KEY?.trim() || process.env.LIVEAVATAR_API_KEY?.trim() || null;
}

export function presenterVoicesConfigured(): boolean {
  return Boolean(heygenApiKey());
}

async function heygenFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = heygenApiKey();
  if (!apiKey) {
    throw AppError.fromHttpStatus(
      503,
      "Presenter voices are not configured. Add HEYGEN_API_KEY or LIVEAVATAR_API_KEY.",
    );
  }
  const headers = new Headers(init?.headers);
  headers.set("X-Api-Key", apiKey);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetchWithTimeout(`${HEYGEN_API_BASE}${path}`, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail =
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.error === "string" && body.error) ||
      `HeyGen request failed (${response.status})`;
    log.warn("HeyGen API error", { path, status: response.status, detail });
    throw AppError.fromHttpStatus(response.status >= 500 ? 502 : response.status, detail);
  }
  return body as T;
}

function mapVoiceRow(row: PresenterVoiceApiRow): PresenterVoice | null {
  const id = String(row.voice_id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(row.name || "Presenter voice"),
    language: row.language,
    gender: row.gender,
    preview_audio_url: row.preview_audio_url ?? null,
  };
}

export async function listPresenterVoices(): Promise<PresenterVoice[]> {
  const now = Date.now();
  if (voiceCache && now - voiceCache.at < VOICE_CACHE_TTL_MS) {
    return voiceCache.voices;
  }

  const collected: PresenterVoice[] = [];
  let token: string | undefined;

  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({
      type: "public",
      limit: "100",
      language: "English",
    });
    if (token) query.set("token", token);

    const payload = await heygenFetch<HeyGenListResponse>(`/v3/voices?${query.toString()}`);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    for (const row of rows) {
      const mapped = mapVoiceRow(row);
      if (mapped) collected.push(mapped);
    }
    if (!payload.has_more || !payload.next_token) break;
    token = payload.next_token;
  }

  voiceCache = { at: now, voices: collected };
  return collected;
}

export async function getPresenterVoice(voiceId: string): Promise<PresenterVoice | null> {
  const normalized = voiceId.trim();
  if (!normalized) return null;

  const cached = voiceCache?.voices.find((voice) => voice.id === normalized);
  if (cached) return cached;

  try {
    const payload = await heygenFetch<HeyGenVoiceResponse>(
      `/v3/voices/${encodeURIComponent(normalized)}`,
    );
    return payload.data ? mapVoiceRow(payload.data) : null;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return null;
    throw error;
  }
}

type HeyGenSpeechResponse = {
  data?: {
    audio_url?: string;
    duration?: number;
    request_id?: string | null;
  };
};

/** Synthesize speech via HeyGen TTS — returns MP3 bytes for lip-sync decode. */
export async function generatePresenterSpeech(args: {
  voiceId: string;
  text: string;
  speed?: number;
}): Promise<ArrayBuffer> {
  const voiceId = args.voiceId.trim();
  if (!voiceId) {
    throw AppError.fromHttpStatus(400, "Presenter voice id is required.");
  }
  const text = args.text.trim();
  if (!text) {
    throw AppError.fromHttpStatus(400, "Sample text is required.");
  }

  const payload = await heygenFetch<HeyGenSpeechResponse>("/v3/voices/speech", {
    method: "POST",
    body: JSON.stringify({
      voice_id: voiceId,
      text,
      speed: args.speed ?? 1,
      input_type: "text",
    }),
  });

  const rawAudioUrl = payload.data?.audio_url?.trim();
  if (!rawAudioUrl) {
    throw AppError.fromHttpStatus(502, "HeyGen returned no audio for this voice.");
  }
  const audioUrl = assertTrustedHeyGenMediaUrl(rawAudioUrl);

  const audioResponse = await fetchWithTimeout(audioUrl, { method: "GET" });
  if (!audioResponse.ok) {
    throw AppError.fromHttpStatus(502, "Could not fetch presenter speech audio.");
  }
  return audioResponse.arrayBuffer();
}

/**
 * Resolve the default HeyGen voice paired with a catalog avatar / look id.
 * LiveAvatar avatar ids map to HeyGen look ids in the same ecosystem.
 */
export async function resolveAvatarDefaultVoice(
  avatarId: string,
): Promise<{ voiceId: string; name?: string } | null> {
  const normalized = avatarId.trim();
  if (!normalized || !presenterVoicesConfigured()) return null;

  try {
    const payload = await heygenFetch<HeyGenLookResponse>(
      `/v3/avatars/looks/${encodeURIComponent(normalized)}`,
    );
    const voiceId = payload.data?.default_voice_id?.trim();
    if (!voiceId) return null;
    const voice = await getPresenterVoice(voiceId);
    return { voiceId, name: voice?.name ?? payload.data?.name };
  } catch (error) {
    if (error instanceof AppError && (error.statusCode === 404 || error.statusCode === 400)) {
      return null;
    }
    log.warn("resolveAvatarDefaultVoice failed", {
      avatarId: normalized,
      error: getErrorMessage(error),
    });
    return null;
  }
}
