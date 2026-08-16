/**
 * Live Video session mode and voice-engine policy.
 *
 * LiveAvatar exposes two session modes, and Wireline supports both:
 *
 * - **LITE** — LiveAvatar renders lip-sync from audio somebody else produces.
 *   Wireline's default pipes its own OpenAI Realtime PCM in, which is why the
 *   presenter speaks with the agent's real Training, tools, and voice rather
 *   than a second disconnected persona. LITE can also hand the conversation to
 *   a provider-side connector (ElevenLabs, OpenAI Realtime) that LiveAvatar
 *   drives itself.
 * - **FULL** — LiveAvatar runs the whole managed pipeline: VAD, STT, LLM, and
 *   TTS. Wireline supplies the avatar, the voice, and the context to think
 *   with. FULL costs 2 provider credits per minute against LITE's 1 and needs a
 *   plan that includes it.
 *
 * HeyGen Video Agent is not a third Live Video engine. It renders an MP4 on
 * `HEYGEN_API_KEY` and must not appear here.
 *
 * Every payload here follows the published session-token schema. The two mode
 * bodies are a discriminated union on `mode`, `avatar_persona` and `voice_agent`
 * are mutually exclusive, and a FULL session with neither a context nor a voice
 * agent starts in restricted mode where the avatar will not answer at all —
 * so this module refuses to mint one rather than selling a silent presenter.
 */

export type LiveVideoMode = "lite" | "full";

export type LiveVideoVoiceEngine =
  /** LITE: Wireline streams OpenAI Realtime PCM into the lip-sync control. */
  | "wireline_realtime"
  /** LITE: LiveAvatar drives an ElevenLabs agent directly, provider-side. */
  | "elevenlabs_agent"
  /** FULL: LiveAvatar's managed STT + LLM + TTS pipeline. */
  | "liveavatar_managed";

export const DEFAULT_LIVE_VIDEO_MODE: LiveVideoMode = "lite";
export const DEFAULT_LIVE_VIDEO_VOICE_ENGINE: LiveVideoVoiceEngine = "wireline_realtime";

export type LiveVideoInteractivity = "CONVERSATIONAL" | "PUSH_TO_TALK";

export type LiveVideoEngineOption = {
  id: LiveVideoVoiceEngine;
  mode: LiveVideoMode;
  label: string;
  description: string;
  /** Provider credits per minute; FULL is twice LITE. */
  creditsPerMinute: number;
};

export const LIVE_VIDEO_ENGINE_CATALOG: readonly LiveVideoEngineOption[] = [
  {
    id: "wireline_realtime",
    mode: "lite",
    label: "Wireline voice",
    description:
      "The presenter speaks with the agent's own Wireline voice, Training, and tools. No second persona to keep in sync.",
    creditsPerMinute: 1,
  },
  {
    id: "elevenlabs_agent",
    mode: "lite",
    label: "Wireline Studio voice",
    description:
      "Lowest first-audio latency through the Studio speech connector, using this agent's approved phone voice when one exists. The conversation runs on the workspace Studio presenter, not this agent's Training.",
    creditsPerMinute: 1,
  },
  {
    id: "liveavatar_managed",
    mode: "full",
    label: "Managed presenter",
    description:
      "Listening, reasoning, and speech run end to end on the workspace presenter profile, not this agent's Training. Uses double the session allowance.",
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
  /** Highest mode this workspace's provider plan is allowed to mint. */
  allowedMode: LiveVideoMode;
  /** LiveAvatar-stored secret id for the ElevenLabs credential. */
  elevenLabsSecretId: string | null;
  /** ElevenLabs agent the provider connector should run. */
  elevenLabsAgentId: string | null;
  /** Optional voice override for the ElevenLabs connector. */
  elevenLabsVoiceId: string | null;
  /** FULL-mode voice identity. */
  managedVoiceId: string | null;
  /** FULL-mode knowledge/guardrail context. Without one the avatar stays mute. */
  managedContextId: string | null;
  /** Stored voice-agent id; the non-deprecated alternative to avatar_persona. */
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
  /** Set when the request asked for an engine that could not be honored. */
  degradedFrom: LiveVideoVoiceEngine | null;
  /** Operator-facing explanation for a degrade. Never rendered to tenants raw. */
  reason: string | null;
};

/**
 * Resolve the engine a session will actually run on.
 *
 * A request for an unavailable engine degrades to the default rather than
 * failing: the presenter still works, just on the managed Wireline voice. The
 * reason is carried back so an operator surface can say what to configure
 * instead of leaving a silently-ignored setting.
 */
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
    // A FULL session with neither a stored voice agent nor a context starts in
    // restricted mode and will not respond to the caller at all. Refuse to
    // spend two credits a minute on a presenter that cannot answer.
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
  /**
   * Agent-scoped ElevenLabs voice for the Studio-voice connector, taking
   * precedence over the workspace-level `LIVEAVATAR_ELEVENLABS_VOICE_ID`.
   * This is what makes "same voice on the phone and on screen" literally true:
   * the caller resolves the agent's PSTN-approved ElevenLabs voice (curated or
   * database-approved clone — the exact rule live calls use) and the presenter
   * speaks with it. Pass only an approved voice id; this module does not
   * re-verify approval.
   */
  voiceIdOverride?: string | null;
};

/**
 * Build the exact session-token body for the resolved mode.
 *
 * Kept pure and exported so the payload is asserted in tests rather than only
 * observed against a live provider. `avatar_persona` is used only when no
 * stored voice agent exists, since the two are mutually exclusive and the
 * persona form is the deprecated one.
 */
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
        ? {
            // No per-session `language` here: the provider rejects language
            // overrides on ElevenLabs-backed stored voice agents with a 400,
            // so the stored agent's own configured language always wins.
            voice_agent: {
              id: request.config.managedVoiceAgentId,
            },
          }
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

/**
 * Engine options with a live availability verdict, for an operator surface.
 * Unavailable options stay visible with the reason attached so the setting is
 * discoverable before the plan or credential exists, not after.
 */
export function describeLiveVideoEngines(
  config: LiveVideoPlatformConfig,
): Array<LiveVideoEngineOption & { available: boolean; reason: string | null }> {
  return LIVE_VIDEO_ENGINE_CATALOG.map((option) => {
    const resolution = resolveLiveVideoEngine({ requested: option.id, config });
    const available = resolution.engine === option.id;
    return { ...option, available, reason: available ? null : resolution.reason };
  });
}
