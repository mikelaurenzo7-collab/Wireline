/**
 * LiveAvatar (HeyGen) server client — LITE mode sessions.
 *
 * Wireline keeps Vapi / OpenAI for voice + brains; LiveAvatar
 * renders photoreal lip-sync video into a LiveKit room. Docs:
 * https://docs.liveavatar.com/docs/lite-mode/overview
 */
import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import {
  buildLiveVideoSessionTokenBody,
  describeLiveVideoEngines,
  readLiveVideoPlatformConfig,
  resolveLiveVideoEngine,
  type LiveVideoMode,
  type LiveVideoVoiceEngine,
} from "./live-video-session-policy";
import type { LiveAvatarSessionCredentials } from "./types";

const LIVEAVATAR_API_BASE = "https://api.liveavatar.com";

type LiveAvatarEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T | null;
};

function liveAvatarApiKey(): string | null {
  return process.env.LIVEAVATAR_API_KEY?.trim() || null;
}

function defaultAvatarId(): string | null {
  return (
    process.env.LIVEAVATAR_DEFAULT_AVATAR_ID?.trim() ||
    process.env.HEYGEN_DEFAULT_AVATAR_ID?.trim() ||
    null
  );
}

export function isLiveAvatarSandbox(): boolean {
  if (process.env.LIVEAVATAR_SANDBOX === "true") return true;
  if (process.env.LIVEAVATAR_SANDBOX === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function getLiveAvatarStatus() {
  const apiKey = liveAvatarApiKey();
  const avatarId = defaultAvatarId();
  const config = readLiveVideoPlatformConfig();
  return {
    configured: Boolean(apiKey),
    avatarCatalogReady: Boolean(apiKey && avatarId),
    sandbox: isLiveAvatarSandbox(),
    defaultAvatarId: avatarId,
    /** Highest session mode the provider plan allows on this workspace. */
    allowedMode: config.allowedMode,
    // Tenant-safe engine catalog: availability only. The configuration hints
    // behind an unavailable engine name workspace env vars and belong to the
    // platform-admin surface (describeLiveVideoEngines), never to tenants.
    engines: describeLiveVideoEngines(config).map(({ reason: _reason, ...engine }) => engine),
  };
}

/** Shared default for new business agents and env documentation. */
export function getDefaultLiveAvatarId(): string | null {
  return defaultAvatarId();
}

export function businessAgentVideoPresenterDefaults(): {
  videoPresenterProvider: string;
  videoPresenterAvatarId: string | null;
  videoPresenterConsentStatus: string;
} {
  return {
    videoPresenterProvider: "synthetic",
    videoPresenterAvatarId: null,
    videoPresenterConsentStatus: "not_started",
  };
}

async function liveAvatarFetch<T>(
  path: string,
  init: RequestInit & { apiKey?: boolean; bearer?: string },
): Promise<T> {
  const apiKey = liveAvatarApiKey();
  if (init.apiKey && !apiKey) {
    throw AppError.fromHttpStatus(
      503,
      "Live video is not configured. Add LIVEAVATAR_API_KEY in environment variables.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.apiKey && apiKey) headers.set("X-API-KEY", apiKey);
  if (init.bearer) headers.set("Authorization", `Bearer ${init.bearer}`);

  const response = await fetchWithTimeout(`${LIVEAVATAR_API_BASE}${path}`, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => null)) as LiveAvatarEnvelope<T> | null;
  if (!response.ok) {
    const detail =
      (typeof body?.message === "string" && body.message) ||
      `LiveAvatar request failed (${response.status})`;
    log.warn("LiveAvatar API error", { path, status: response.status, detail });
    throw AppError.fromHttpStatus(response.status >= 500 ? 502 : response.status, detail);
  }

  if (!body?.data) {
    throw AppError.fromHttpStatus(502, "LiveAvatar returned an empty response.");
  }
  return body.data;
}

/**
 * Mint a session token for the resolved mode.
 *
 * The mode and engine decision lives in `live-video-session-policy.ts`; this
 * function only carries the resulting body to the provider. A caller that
 * passes no engine preference gets LITE on the Wireline voice, which is the
 * long-standing default.
 */
export async function mintLiveAvatarSessionToken(input: {
  avatarId: string;
  maxSessionDurationSeconds?: number;
  requestedEngine?: unknown;
  language?: string;
  /**
   * The agent's PSTN-approved ElevenLabs voice, when the caller verified one.
   * On the Studio-voice engine this makes the presenter speak the same voice
   * the agent uses on live phone calls.
   */
  agentElevenLabsVoiceId?: string | null;
}): Promise<{
  sessionToken: string;
  sandbox: boolean;
  mode: LiveVideoMode;
  engine: LiveVideoVoiceEngine;
  creditsPerMinute: number;
  degradedFrom: LiveVideoVoiceEngine | null;
  degradeReason: string | null;
}> {
  const sandbox = isLiveAvatarSandbox();
  const config = readLiveVideoPlatformConfig();
  const resolution = resolveLiveVideoEngine({ requested: input.requestedEngine, config });

  if (resolution.degradedFrom) {
    log.warn("Live Video engine degraded to the managed default", {
      requested: resolution.degradedFrom,
      resolved: resolution.engine,
      reason: resolution.reason,
    });
  }

  const tokenPayload = await liveAvatarFetch<{ session_token: string }>("/v1/sessions/token", {
    method: "POST",
    apiKey: true,
    body: JSON.stringify(
      buildLiveVideoSessionTokenBody({
        avatarId: input.avatarId,
        resolution,
        config,
        sandbox,
        maxSessionDurationSeconds: input.maxSessionDurationSeconds,
        language: input.language,
        voiceIdOverride: input.agentElevenLabsVoiceId ?? null,
      }),
    ),
  });

  return {
    sessionToken: tokenPayload.session_token,
    sandbox,
    mode: resolution.mode,
    engine: resolution.engine,
    creditsPerMinute: resolution.creditsPerMinute,
    degradedFrom: resolution.degradedFrom,
    degradeReason: resolution.reason,
  };
}

/** @deprecated Use `mintLiveAvatarSessionToken`, which also supports FULL mode. */
export async function mintLiveAvatarLiteSessionToken(input: {
  avatarId: string;
  maxSessionDurationSeconds?: number;
}): Promise<{ sessionToken: string; sandbox: boolean }> {
  const { sessionToken, sandbox } = await mintLiveAvatarSessionToken(input);
  return { sessionToken, sandbox };
}

/** @deprecated Prefer mintLiveAvatarLiteSessionToken + client SDK start(). */
export async function createLiveAvatarLiteSession(input: {
  avatarId: string;
  maxSessionDurationSeconds?: number;
}): Promise<LiveAvatarSessionCredentials> {
  const sandbox = isLiveAvatarSandbox();

  try {
    const tokenPayload = await liveAvatarFetch<{ session_token: string }>("/v1/sessions/token", {
      method: "POST",
      apiKey: true,
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: input.avatarId,
        is_sandbox: sandbox,
        video_settings: { quality: "high" },
        ...(input.maxSessionDurationSeconds
          ? { max_session_duration: input.maxSessionDurationSeconds }
          : {}),
      }),
    });

    const started = await liveAvatarFetch<{
      session_id: string;
      livekit_url: string;
      livekit_client_token: string;
      ws_url?: string | null;
    }>("/v1/sessions/start", {
      method: "POST",
      bearer: tokenPayload.session_token,
      body: JSON.stringify({}),
    });

    return {
      provider: "liveavatar",
      sessionToken: tokenPayload.session_token,
      sessionId: started.session_id,
      livekitUrl: started.livekit_url,
      livekitClientToken: started.livekit_client_token,
      wsUrl: started.ws_url ?? null,
      sandbox,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.fromHttpStatus(
      502,
      getErrorMessage(error) || "Could not start live video session.",
    );
  }
}

export type PublicAvatar = {
  id: string;
  name: string;
  previewImageUrl?: string | null;
  defaultVoiceId?: string | null;
};

/**
 * The public avatar catalog is a global, slowly-changing vendor list — the same
 * fifty rows for every tenant. It was fetched from the provider on every load
 * of the presenter picker by every authenticated account, entitled or not, so
 * ordinary browsing drove vendor API volume that no customer had bought.
 *
 * Cached in process with a short TTL and in-flight de-duplication, so a burst
 * of page loads collapses to one upstream call. Deliberately not Redis: the
 * value is small, identical for everyone, and a per-instance cache is enough to
 * flatten the load without adding a dependency to a browse path.
 */
const PUBLIC_AVATAR_CACHE_TTL_MS = 10 * 60 * 1000;
let publicAvatarCache: { expiresAt: number; avatars: PublicAvatar[] } | null = null;
let publicAvatarInFlight: Promise<PublicAvatar[]> | null = null;

export function resetLiveAvatarCatalogCacheForTests(): void {
  publicAvatarCache = null;
  publicAvatarInFlight = null;
}

export async function listPublicAvatars(): Promise<PublicAvatar[]> {
  const now = Date.now();
  if (publicAvatarCache && publicAvatarCache.expiresAt > now) return publicAvatarCache.avatars;
  if (publicAvatarInFlight) return publicAvatarInFlight;

  publicAvatarInFlight = fetchPublicAvatars()
    .then((avatars) => {
      publicAvatarCache = { expiresAt: Date.now() + PUBLIC_AVATAR_CACHE_TTL_MS, avatars };
      return avatars;
    })
    .finally(() => {
      publicAvatarInFlight = null;
    });
  return publicAvatarInFlight;
}

async function fetchPublicAvatars(): Promise<PublicAvatar[]> {
  const data = await liveAvatarFetch<{
    results?: Array<{
      id?: string;
      name?: string;
      preview_url?: string | null;
      default_voice_id?: string | null;
    }>;
  }>("/v1/avatars/public?page_size=50", { method: "GET", apiKey: true });

  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || "Avatar"),
      previewImageUrl: row.preview_url ?? null,
      defaultVoiceId: row.default_voice_id?.trim() || null,
    }))
    .filter((row) => row.id);
}

export function resolveLiveAvatarIdForAgent(agent: {
  videoPresenterAvatarId?: string | null;
  videoPresenterProvider?: string | null;
}): string | null {
  if (agent.videoPresenterAvatarId?.trim()) return agent.videoPresenterAvatarId.trim();
  return defaultAvatarId();
}
