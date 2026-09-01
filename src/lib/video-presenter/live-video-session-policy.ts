/**
 * Retired Live Video session policy.
 *
 * Historical responses and accounting rows can still contain FULL mode and
 * the old managed-speech engine. Those values remain in the exported wire
 * types so old records can be decoded safely, but no active configuration,
 * resolver, catalog, or token payload may select them. If the visual presenter
 * surface is reintroduced, it can only render audio produced by BotBound's
 * OpenAI Realtime session until a separately reviewed policy replaces this
 * fail-closed boundary.
 */

/** `full` is legacy-read-only; new sessions are always `lite`. */
export type LiveVideoMode = "lite" | "full";

/** `liveavatar_managed` is legacy-read-only and cannot be selected. */
export type LiveVideoVoiceEngine = "wireline_realtime" | "liveavatar_managed";

export const DEFAULT_LIVE_VIDEO_MODE: LiveVideoMode = "lite";
export const DEFAULT_LIVE_VIDEO_VOICE_ENGINE: LiveVideoVoiceEngine = "wireline_realtime";

export type LiveVideoInteractivity = "CONVERSATIONAL" | "PUSH_TO_TALK";

export type LiveVideoEngineOption = {
  id: LiveVideoVoiceEngine;
  mode: LiveVideoMode;
  label: string;
  description: string;
  creditsPerMinute: number;
};

export const LIVE_VIDEO_ENGINE_CATALOG: readonly LiveVideoEngineOption[] = [
  {
    id: "wireline_realtime",
    mode: "lite",
    label: "BotBound voice",
    description:
      "The presenter renders the Bot's OpenAI voice, Training, and tools. No alternate speech engine is available.",
    creditsPerMinute: 1,
  },
] as const;

export function engineOption(id: LiveVideoVoiceEngine): LiveVideoEngineOption {
  const found = LIVE_VIDEO_ENGINE_CATALOG.find((option) => option.id === id);
  if (!found) throw new Error(`Unknown or retired live video engine: ${id}`);
  return found;
}

export function normalizeLiveVideoMode(value: unknown): LiveVideoMode | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return candidate === DEFAULT_LIVE_VIDEO_MODE ? DEFAULT_LIVE_VIDEO_MODE : null;
}

export function normalizeLiveVideoVoiceEngine(value: unknown): LiveVideoVoiceEngine | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return candidate === DEFAULT_LIVE_VIDEO_VOICE_ENGINE ? DEFAULT_LIVE_VIDEO_VOICE_ENGINE : null;
}

/**
 * Kept as a compatibility shape for callers that deserialize historical
 * configuration. Managed presenter identifiers are deliberately always null.
 */
export type LiveVideoPlatformConfig = {
  allowedMode: LiveVideoMode;
  managedVoiceId: string | null;
  managedContextId: string | null;
  managedVoiceAgentId: string | null;
};

export function readLiveVideoPlatformConfig(
  _env: NodeJS.ProcessEnv = process.env,
): LiveVideoPlatformConfig {
  return {
    allowedMode: DEFAULT_LIVE_VIDEO_MODE,
    managedVoiceId: null,
    managedContextId: null,
    managedVoiceAgentId: null,
  };
}

export type LiveVideoEngineResolution = {
  mode: LiveVideoMode;
  engine: LiveVideoVoiceEngine;
  creditsPerMinute: number;
  degradedFrom: LiveVideoVoiceEngine | null;
  reason: string | null;
};

export function resolveLiveVideoEngine(input: {
  requested?: unknown;
  config: LiveVideoPlatformConfig;
}): LiveVideoEngineResolution {
  const rawRequested =
    typeof input.requested === "string" ? input.requested.trim().toLowerCase() : "";
  const requested = normalizeLiveVideoVoiceEngine(input.requested);
  const retiredManagedSpeechRequested = rawRequested === "liveavatar_managed";

  return {
    mode: DEFAULT_LIVE_VIDEO_MODE,
    engine: DEFAULT_LIVE_VIDEO_VOICE_ENGINE,
    creditsPerMinute: engineOption(DEFAULT_LIVE_VIDEO_VOICE_ENGINE).creditsPerMinute,
    degradedFrom: retiredManagedSpeechRequested ? "liveavatar_managed" : null,
    reason: retiredManagedSpeechRequested
      ? "Managed presenter speech is retired. Live Video can only render the Bot's OpenAI voice."
      : requested
        ? null
        : rawRequested
          ? "Only the BotBound OpenAI voice engine is supported."
          : null,
  };
}

export type LiveVideoTokenRequest = {
  avatarId: string;
  resolution: LiveVideoEngineResolution;
  config: LiveVideoPlatformConfig;
  sandbox: boolean;
  maxSessionDurationSeconds?: number;
  language?: string;
  interactivity?: LiveVideoInteractivity;
  videoQuality?: "very_high" | "high" | "medium" | "low";
  voiceIdOverride?: string | null;
};

export function buildLiveVideoSessionTokenBody(
  request: LiveVideoTokenRequest,
): Record<string, unknown> {
  // Do not trust a caller-provided resolution. This is the final provider
  // boundary, so even a forged/legacy FULL resolution must remain LITE and can
  // never carry managed voice, persona, context, or voice-agent identifiers.
  return {
    avatar_id: request.avatarId,
    is_sandbox: request.sandbox,
    video_settings: { quality: request.videoQuality ?? "high" },
    ...(request.maxSessionDurationSeconds
      ? { max_session_duration: request.maxSessionDurationSeconds }
      : {}),
    mode: "LITE",
  };
}

export function describeLiveVideoEngines(
  _config: LiveVideoPlatformConfig,
): Array<LiveVideoEngineOption & { available: boolean; reason: string | null }> {
  return LIVE_VIDEO_ENGINE_CATALOG.map((option) => ({
    ...option,
    available: true,
    reason: null,
  }));
}
