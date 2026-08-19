/**
 * Live Video session mode and voice-engine policy.
 *
 * LiveAvatar exposes two session modes, and BotBound supports both:
 *
 * - LITE: LiveAvatar renders lip-sync from audio somebody else produces.
 *   BotBound's default pipes its own OpenAI Realtime PCM in, so the presenter
 *   speaks with the Bot's real Training, tools, and voice rather than a second
 *   disconnected persona.
 * - FULL: LiveAvatar runs the managed VAD, STT, LLM, and TTS pipeline. BotBound
 *   supplies the avatar, voice, and context. FULL costs 2 provider credits per
 *   minute against LITE's 1 and needs a plan that includes it.
 */

export type LiveVideoMode = "lite" | "full";

export type LiveVideoVoiceEngine =
  | "wireline_realtime"
  | "elevenlabs_agent"
  | "liveavatar_managed";

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
      "The presenter speaks with the Bot's own BotBound voice, Training, and tools. No second persona to keep in sync.",
    creditsPerMinute: 1,
  },
  {
    id: "elevenlabs_agent",
    mode: "lite",
    label: "BotBound Studio voice",
    description:
      "Lowest first-audio latency through the Studio speech connector, using this Bot's approved phone voice when one exists. The conversation runs on the workspace Studio presenter, not this Bot's Training.",
    creditsPerMinute: 1,
  },
  {
    id: "liveavatar_managed",
    mode: "full",
    label: "Managed presenter",
    description:
      "Listening, reasoning, and speech run end to end on the workspace presenter profile, not this Bot's Training. Uses double the session allowance.",
    creditsPerMinute: 2,
  },
] as const;

export function engineOption(id: LiveVideoVoiceEngine): LiveVideoEngineOption {
  const found = LIVE_VIDEO_ENGINE_CATALOG.find((option) => option.id === id);
  if (!found) throw new Error(`Unknown live video engine: ${id}`);
  return found;
}

export function normalizeLiveVideoMode(value: unknown): LiveVideoMode | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return candidate === "lite" || candidate === "full" ? candidate : null;
}

export function normalizeLiveVideoVoiceEngine(value: unknown): LiveVideoVoiceEngine | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return LIVE_VIDEO_ENGINE_CATALOG.some((option) => option.id === candidate)
    ? (candidate as LiveVideoVoiceEngine)
    : null;
}

export type LiveVideoPlatformConfig = {
  allowedMode: LiveVideoMode;
  elevenLabsSecretId: string | null;
  elevenLabsAgentId: string | null;
  elevenLabsVoiceId: string | null;
  managedVoiceId: string | null;
  managedContextId: string | null;
  managedVoiceAgentId: string | null;
};

function trimmed(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate ? candidate : null;
}

export function readLiveVideoPlatformConfig(
  env: NodeJS.ProcessEnv = process.env,
): LiveVideoPlatformConfig {
  return {
    allowedMode: normalizeLiveVideoMode(env.LIVEAVATAR_MODE) ?? DEFAULT_LIVE_VIDEO_MODE,
    elevenLabsSecretId: trimmed(env.LIVEAVATAR_ELEVENLABS_SECRET_ID),
    elevenLabsAgentId: trimmed(env.LIVEAVATAR_ELEVENLABS_AGENT_ID),
    elevenLabsVoiceId: trimmed(env.LIVEAVATAR_ELEVENLABS_VOICE_ID),
    managedVoiceId: trimmed(env.LIVEAVATAR_VOICE_ID),
    managedContextId: trimmed(env.LIVEAVATAR_CONTEXT_ID),
    managedVoiceAgentId: trimmed(env.LIVEAVATAR_VOICE_AGENT_ID),
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
  const fallback = (
    degradedFrom: LiveVideoVoiceEngine | null,
    reason: string | null,
  ): LiveVideoEngineResolution => ({
    mode: "lite",
    engine: DEFAULT_LIVE_VIDEO_VOICE_ENGINE,
    creditsPerMinute: engineOption(DEFAULT_LIVE_VIDEO_VOICE_ENGINE).creditsPerMinute,
    degradedFrom,
    reason,
  });

  const requested = normalizeLiveVideoVoiceEngine(input.requested);
  if (!requested || requested === DEFAULT_LIVE_VIDEO_VOICE_ENGINE) {
    return fallback(null, null);
  }

  const option = engineOption(requested);
  if (option.mode === "full" && input.config.allowedMode !== "full") {
    return fallback(
      requested,
      "Managed presenter sessions need a provider plan that includes FULL mode. Set LIVEAVATAR_MODE=full once the plan is upgraded.",
    );
  }

  if (requested === "elevenlabs_agent") {
    if (!input.config.elevenLabsSecretId || !input.config.elevenLabsAgentId) {
      return fallback(
        requested,
        "Studio voice needs LIVEAVATAR_ELEVENLABS_SECRET_ID and LIVEAVATAR_ELEVENLABS_AGENT_ID. The secret id is the ElevenLabs credential stored with the video provider, not the raw API key.",
      );
    }
  }

  if (requested === "liveavatar_managed") {
    if (!input.config.managedVoiceAgentId && !input.config.managedContextId) {
      return fallback(
        requested,
        "Managed presenter needs LIVEAVATAR_VOICE_AGENT_ID or LIVEAVATAR_CONTEXT_ID. Without one the provider starts the avatar in restricted mode and it will not answer.",
      );
    }
  }

  return {
    mode: option.mode,
    engine: requested,
    creditsPerMinute: option.creditsPerMinute,
    degradedFrom: null,
    reason: null,
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
  const base: Record<string, unknown> = {
    avatar_id: request.avatarId,
    is_sandbox: request.sandbox,
    video_settings: { quality: request.videoQuality ?? "high" },
    ...(request.maxSessionDurationSeconds
      ? { max_session_duration: request.maxSessionDurationSeconds }
      : {}),
  };

  if (request.resolution.mode === "full") {
    return {
      ...base,
      mode: "FULL",
      interactivity_type: request.interactivity ?? "CONVERSATIONAL",
      ...(request.config.managedVoiceAgentId
        ? { voice_agent: { id: request.config.managedVoiceAgentId } }
        : {
            avatar_persona: {
              ...(request.config.managedVoiceId ? { voice_id: request.config.managedVoiceId } : {}),
              ...(request.config.managedContextId
                ? { context_id: request.config.managedContextId }
                : {}),
              language: request.language || "en",
            },
          }),
    };
  }

  const connectorVoiceId =
    request.voiceIdOverride?.trim() || request.config.elevenLabsVoiceId || null;

  return {
    ...base,
    mode: "LITE",
    ...(request.resolution.engine === "elevenlabs_agent" &&
    request.config.elevenLabsSecretId &&
    request.config.elevenLabsAgentId
      ? {
          elevenlabs_agent_config: {
            secret_id: request.config.elevenLabsSecretId,
            agent_id: request.config.elevenLabsAgentId,
            ...(connectorVoiceId ? { voice_id: connectorVoiceId } : {}),
          },
        }
      : {}),
  };
}

export function describeLiveVideoEngines(
  config: LiveVideoPlatformConfig,
): Array<LiveVideoEngineOption & { available: boolean; reason: string | null }> {
  return LIVE_VIDEO_ENGINE_CATALOG.map((option) => {
    const resolution = resolveLiveVideoEngine({ requested: option.id, config });
    const available = resolution.engine === option.id;
    return { ...option, available, reason: available ? null : resolution.reason };
  });
}
