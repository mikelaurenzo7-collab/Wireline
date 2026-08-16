/**
 * HeyGen presenter voices — public catalog + avatar default voice matching.
 *
 * LiveAvatar handles faces; HeyGen v3 Voices API supplies lip-sync-aligned
 * public voice IDs and preview_audio_url samples for the create flow.
 *
 * Security invariant: callers may resolve only voices returned by the
 * provider's `type=public` catalog. Exact-ID provider lookups are intentionally
 * forbidden because the shared provider account may also contain private or
 * generated voices that do not belong in a cross-tenant catalog.
 */
import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { providerHttpError } from "../provider-http-error";

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
  return process.env.HEYGEN_API_KEY?.trim() || null;
}

export function presenterVoicesConfigured(): boolean {
  return Boolean(heygenApiKey());
}

async function heygenFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = heygenApiKey();
  if (!apiKey) {
    throw AppError.fromHttpStatus(503, "Presenter voices are not configured. Add HEYGEN_API_KEY.");
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
    throw providerHttpError({
      provider: "HeyGen",
      path,
      status: response.status,
      detail:
        (typeof body?.message === "string" && body.message) ||
        (typeof body?.error === "string" && body.error) ||
        undefined,
      unavailableMessage:
        "Presenter voices are temporarily unavailable. Wireline has been notified, your agent's other channels are unaffected.",
    });
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

/** Resolve a presenter voice only when it belongs to the public provider catalog. */
export async function getPresenterVoice(voiceId: string): Promise<PresenterVoice> {
  const normalized = voiceId.trim();
  if (!normalized) {
    throw AppError.fromHttpStatus(404, "Presenter voice not found.");
  }

  const voice = (await listPresenterVoices()).find((candidate) => candidate.id === normalized);
  if (!voice) {
    throw AppError.fromHttpStatus(404, "Presenter voice not found.");
  }
  return voice;
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

  // Enforce the same public-catalog boundary before paid synthesis.
  await getPresenterVoice(voiceId);

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
 * Resolve the default public voice paired with a HeyGen look id.
 *
 * LiveAvatar session UUIDs and HeyGen look ids are different catalogs.
 * A miss (404/400) is normal for a live-video UUID and must not throw.
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
    return { voiceId, name: voice.name };
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
