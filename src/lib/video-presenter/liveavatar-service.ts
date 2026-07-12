/**
 * LiveAvatar (HeyGen) server client — LITE mode sessions.
 *
 * Wireline keeps Vapi / ElevenLabs / OpenAI for voice + brains; LiveAvatar
 * renders photoreal lip-sync video into a LiveKit room. Docs:
 * https://docs.liveavatar.com/docs/lite-mode/overview
 */
import { AppError } from "../api-error";
import { fetchWithTimeout, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
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
  return {
    configured: Boolean(apiKey),
    avatarCatalogReady: Boolean(apiKey && avatarId),
    sandbox: isLiveAvatarSandbox(),
    defaultAvatarId: avatarId,
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

export async function mintLiveAvatarLiteSessionToken(input: {
  avatarId: string;
  maxSessionDurationSeconds?: number;
}): Promise<{ sessionToken: string; sandbox: boolean }> {
  const sandbox = isLiveAvatarSandbox();
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
  return { sessionToken: tokenPayload.session_token, sandbox };
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

export async function listPublicAvatars(): Promise<
  Array<{
    id: string;
    name: string;
    previewImageUrl?: string | null;
    defaultVoiceId?: string | null;
  }>
> {
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
