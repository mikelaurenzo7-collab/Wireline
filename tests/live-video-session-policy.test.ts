import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIVE_VIDEO_MODE,
  DEFAULT_LIVE_VIDEO_VOICE_ENGINE,
  LIVE_VIDEO_ENGINE_CATALOG,
  buildLiveVideoSessionTokenBody,
  describeLiveVideoEngines,
  normalizeLiveVideoMode,
  normalizeLiveVideoVoiceEngine,
  readLiveVideoPlatformConfig,
  resolveLiveVideoEngine,
  type LiveVideoPlatformConfig,
} from "../src/lib/video-presenter/live-video-session-policy";

const bareConfig: LiveVideoPlatformConfig = {
  allowedMode: "lite",
  elevenLabsSecretId: null,
  elevenLabsAgentId: null,
  elevenLabsVoiceId: null,
  managedVoiceId: null,
  managedContextId: null,
  managedVoiceAgentId: null,
};

const studioConfig: LiveVideoPlatformConfig = {
  ...bareConfig,
  elevenLabsSecretId: "11111111-2222-3333-4444-555555555555",
  elevenLabsAgentId: "agent_studio",
};

const managedConfig: LiveVideoPlatformConfig = {
  ...bareConfig,
  allowedMode: "full",
  managedVoiceId: "voice-uuid",
  managedContextId: "context-uuid",
};

describe("live video mode and engine normalization", () => {
  it("defaults to the LITE Wireline-voice pipeline", () => {
    expect(DEFAULT_LIVE_VIDEO_MODE).toBe("lite");
    expect(DEFAULT_LIVE_VIDEO_VOICE_ENGINE).toBe("wireline_realtime");
  });

  it("accepts only the published modes", () => {
    expect(normalizeLiveVideoMode("LITE")).toBe("lite");
    expect(normalizeLiveVideoMode(" full ")).toBe("full");
    expect(normalizeLiveVideoMode("turbo")).toBeNull();
    expect(normalizeLiveVideoMode(undefined)).toBeNull();
  });

  it("accepts only catalog engines", () => {
    expect(normalizeLiveVideoVoiceEngine("elevenlabs_agent")).toBe("elevenlabs_agent");
    expect(normalizeLiveVideoVoiceEngine("nope")).toBeNull();
    expect(normalizeLiveVideoVoiceEngine(7)).toBeNull();
  });

  it("prices FULL at twice LITE, matching the provider's credit rate", () => {
    const lite = LIVE_VIDEO_ENGINE_CATALOG.filter((option) => option.mode === "lite");
    const full = LIVE_VIDEO_ENGINE_CATALOG.filter((option) => option.mode === "full");
    expect(lite.every((option) => option.creditsPerMinute === 1)).toBe(true);
    expect(full.every((option) => option.creditsPerMinute === 2)).toBe(true);
  });

  it("keeps every catalog label free of third-party vendor names", () => {
    for (const option of LIVE_VIDEO_ENGINE_CATALOG) {
      const text = `${option.label} ${option.description}`.toLowerCase();
      for (const vendor of ["heygen", "liveavatar", "elevenlabs", "openai", "cartesia"]) {
        expect(text).not.toContain(vendor);
      }
    }
  });
});

describe("live video platform config", () => {
  it("reads LITE as the default allowed mode", () => {
    expect(readLiveVideoPlatformConfig({} as NodeJS.ProcessEnv).allowedMode).toBe("lite");
  });

  it("reads the configured provider ids", () => {
    const config = readLiveVideoPlatformConfig({
      LIVEAVATAR_MODE: "full",
      LIVEAVATAR_ELEVENLABS_SECRET_ID: " secret ",
      LIVEAVATAR_ELEVENLABS_AGENT_ID: "agent_1",
      LIVEAVATAR_CONTEXT_ID: "ctx_1",
    } as NodeJS.ProcessEnv);
    expect(config.allowedMode).toBe("full");
    expect(config.elevenLabsSecretId).toBe("secret");
    expect(config.elevenLabsAgentId).toBe("agent_1");
    expect(config.managedContextId).toBe("ctx_1");
  });

  it("treats blank values as unset rather than empty strings", () => {
    const config = readLiveVideoPlatformConfig({
      LIVEAVATAR_ELEVENLABS_SECRET_ID: "   ",
    } as NodeJS.ProcessEnv);
    expect(config.elevenLabsSecretId).toBeNull();
  });
});

describe("live video engine resolution", () => {
  it("resolves the default engine with no degrade", () => {
    const resolution = resolveLiveVideoEngine({ config: bareConfig });
    expect(resolution).toMatchObject({
      mode: "lite",
      engine: "wireline_realtime",
      creditsPerMinute: 1,
      degradedFrom: null,
      reason: null,
    });
  });

  it("degrades an unknown engine to the managed default without failing", () => {
    expect(resolveLiveVideoEngine({ requested: "sorcery", config: bareConfig })).toMatchObject({
      engine: "wireline_realtime",
      degradedFrom: null,
    });
  });

  it("refuses the studio connector without both provider ids and says which", () => {
    const resolution = resolveLiveVideoEngine({
      requested: "elevenlabs_agent",
      config: bareConfig,
    });
    expect(resolution.engine).toBe("wireline_realtime");
    expect(resolution.degradedFrom).toBe("elevenlabs_agent");
    expect(resolution.reason).toContain("LIVEAVATAR_ELEVENLABS_SECRET_ID");
    expect(resolution.reason).toContain("LIVEAVATAR_ELEVENLABS_AGENT_ID");
  });

  it("refuses the studio connector when only one of the two ids is set", () => {
    expect(
      resolveLiveVideoEngine({
        requested: "elevenlabs_agent",
        config: { ...bareConfig, elevenLabsSecretId: "secret" },
      }).degradedFrom,
    ).toBe("elevenlabs_agent");
    expect(
      resolveLiveVideoEngine({
        requested: "elevenlabs_agent",
        config: { ...bareConfig, elevenLabsAgentId: "agent" },
      }).degradedFrom,
    ).toBe("elevenlabs_agent");
  });

  it("resolves the studio connector once both provider ids exist", () => {
    expect(
      resolveLiveVideoEngine({ requested: "elevenlabs_agent", config: studioConfig }),
    ).toMatchObject({ mode: "lite", engine: "elevenlabs_agent", degradedFrom: null });
  });

  it("refuses the managed presenter until the plan allows FULL", () => {
    const resolution = resolveLiveVideoEngine({
      requested: "liveavatar_managed",
      config: { ...managedConfig, allowedMode: "lite" },
    });
    expect(resolution.engine).toBe("wireline_realtime");
    expect(resolution.reason).toContain("LIVEAVATAR_MODE=full");
  });

  it("refuses a FULL session that would start the avatar mute", () => {
    const resolution = resolveLiveVideoEngine({
      requested: "liveavatar_managed",
      config: { ...bareConfig, allowedMode: "full", managedVoiceId: "voice-uuid" },
    });
    expect(resolution.engine).toBe("wireline_realtime");
    expect(resolution.reason).toContain("restricted mode");
  });

  it("resolves the managed presenter with a context", () => {
    expect(
      resolveLiveVideoEngine({ requested: "liveavatar_managed", config: managedConfig }),
    ).toMatchObject({ mode: "full", engine: "liveavatar_managed", creditsPerMinute: 2 });
  });

  it("accepts a stored voice agent in place of a context", () => {
    expect(
      resolveLiveVideoEngine({
        requested: "liveavatar_managed",
        config: { ...bareConfig, allowedMode: "full", managedVoiceAgentId: "va_1" },
      }).engine,
    ).toBe("liveavatar_managed");
  });
});

describe("live video session token payload", () => {
  const common = { avatarId: "avatar_1", sandbox: true, maxSessionDurationSeconds: 300 };

  it("builds the LITE body with no connector by default", () => {
    const body = buildLiveVideoSessionTokenBody({
      ...common,
      resolution: resolveLiveVideoEngine({ config: bareConfig }),
      config: bareConfig,
    });
    expect(body).toEqual({
      mode: "LITE",
      avatar_id: "avatar_1",
      is_sandbox: true,
      video_settings: { quality: "high" },
      max_session_duration: 300,
    });
  });

  it("attaches the studio connector using the stored secret id, never a raw key", () => {
    const body = buildLiveVideoSessionTokenBody({
      ...common,
      resolution: resolveLiveVideoEngine({ requested: "elevenlabs_agent", config: studioConfig }),
      config: studioConfig,
    });
    expect(body.mode).toBe("LITE");
    expect(body.elevenlabs_agent_config).toEqual({
      secret_id: studioConfig.elevenLabsSecretId,
      agent_id: "agent_studio",
    });
    expect(JSON.stringify(body)).not.toMatch(/xi-api-key|sk_/i);
  });

  it("carries an optional connector voice override when configured", () => {
    const config = { ...studioConfig, elevenLabsVoiceId: "voice_override" };
    const body = buildLiveVideoSessionTokenBody({
      ...common,
      resolution: resolveLiveVideoEngine({ requested: "elevenlabs_agent", config }),
      config,
    });
    expect(body.elevenlabs_agent_config).toMatchObject({ voice_id: "voice_override" });
  });

  it("builds the FULL body with a persona when no voice agent is stored", () => {
    const body = buildLiveVideoSessionTokenBody({
      ...common,
      resolution: resolveLiveVideoEngine({
        requested: "liveavatar_managed",
        config: managedConfig,
      }),
      config: managedConfig,
    });
    expect(body).toMatchObject({
      mode: "FULL",
      interactivity_type: "CONVERSATIONAL",
      avatar_persona: {
        voice_id: "voice-uuid",
        context_id: "context-uuid",
        language: "en",
      },
    });
    expect(body.voice_agent).toBeUndefined();
  });

  it("prefers the stored voice agent and never sends both forms", () => {
    const config = { ...managedConfig, managedVoiceAgentId: "va_1" };
    const body = buildLiveVideoSessionTokenBody({
      ...common,
      language: "es-MX",
      resolution: resolveLiveVideoEngine({ requested: "liveavatar_managed", config }),
      config,
    });
    expect(body.voice_agent).toEqual({ id: "va_1", language: "es-MX" });
    expect(body.avatar_persona).toBeUndefined();
  });

  it("honors push-to-talk when asked", () => {
    const body = buildLiveVideoSessionTokenBody({
      ...common,
      interactivity: "PUSH_TO_TALK",
      resolution: resolveLiveVideoEngine({
        requested: "liveavatar_managed",
        config: managedConfig,
      }),
      config: managedConfig,
    });
    expect(body.interactivity_type).toBe("PUSH_TO_TALK");
  });

  it("omits max_session_duration when the caller sets no ceiling", () => {
    const body = buildLiveVideoSessionTokenBody({
      avatarId: "avatar_1",
      sandbox: false,
      resolution: resolveLiveVideoEngine({ config: bareConfig }),
      config: bareConfig,
    });
    expect("max_session_duration" in body).toBe(false);
  });

  it("falls back to the LITE body when a FULL request degraded", () => {
    const resolution = resolveLiveVideoEngine({
      requested: "liveavatar_managed",
      config: bareConfig,
    });
    const body = buildLiveVideoSessionTokenBody({ ...common, resolution, config: bareConfig });
    expect(body.mode).toBe("LITE");
  });
});

describe("operator engine listing", () => {
  it("shows unavailable engines with the reason instead of hiding them", () => {
    const described = describeLiveVideoEngines(bareConfig);
    expect(described).toHaveLength(LIVE_VIDEO_ENGINE_CATALOG.length);

    const managed = described.find((option) => option.id === "liveavatar_managed");
    expect(managed?.available).toBe(false);
    expect(managed?.reason).toBeTruthy();

    const wireline = described.find((option) => option.id === "wireline_realtime");
    expect(wireline?.available).toBe(true);
    expect(wireline?.reason).toBeNull();
  });

  it("marks engines available once their configuration lands", () => {
    const described = describeLiveVideoEngines({
      ...studioConfig,
      allowedMode: "full",
      managedVoiceId: "voice-uuid",
      managedContextId: "context-uuid",
    });
    expect(described.every((option) => option.available)).toBe(true);
  });
});
