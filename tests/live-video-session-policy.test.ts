import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIVE_VIDEO_MODE,
  DEFAULT_LIVE_VIDEO_VOICE_ENGINE,
  LIVE_VIDEO_ENGINE_CATALOG,
  buildLiveVideoSessionTokenBody,
  describeLiveVideoEngines,
  engineOption,
  normalizeLiveVideoMode,
  normalizeLiveVideoVoiceEngine,
  readLiveVideoPlatformConfig,
  resolveLiveVideoEngine,
  type LiveVideoEngineResolution,
  type LiveVideoPlatformConfig,
} from "../src/lib/video-presenter/live-video-session-policy";
import { sessionExpectsWirelineAudio } from "../src/lib/video-presenter/types";
import {
  LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
  liveVideoSessionReservationMinutes,
} from "../src/lib/video-presenter/live-video-policy";

const bareConfig: LiveVideoPlatformConfig = {
  allowedMode: "lite",
  managedVoiceId: null,
  managedContextId: null,
  managedVoiceAgentId: null,
};

describe("retired live video speech policy", () => {
  it("publishes only the LITE BotBound voice engine", () => {
    expect(DEFAULT_LIVE_VIDEO_MODE).toBe("lite");
    expect(DEFAULT_LIVE_VIDEO_VOICE_ENGINE).toBe("wireline_realtime");
    expect(LIVE_VIDEO_ENGINE_CATALOG).toEqual([
      expect.objectContaining({
        id: "wireline_realtime",
        mode: "lite",
        creditsPerMinute: 1,
      }),
    ]);
  });

  it("normalizes only active LITE and BotBound-engine values", () => {
    expect(normalizeLiveVideoMode(" LITE ")).toBe("lite");
    expect(normalizeLiveVideoMode("full")).toBeNull();
    expect(normalizeLiveVideoVoiceEngine(" wireline_realtime ")).toBe("wireline_realtime");
    expect(normalizeLiveVideoVoiceEngine("liveavatar_managed")).toBeNull();
    expect(normalizeLiveVideoVoiceEngine("elevenlabs_agent")).toBeNull();
    expect(normalizeLiveVideoVoiceEngine(7)).toBeNull();
  });

  it("does not catalog the retired managed engine", () => {
    expect(() => engineOption("liveavatar_managed")).toThrow(/retired/i);
    expect(LIVE_VIDEO_ENGINE_CATALOG.map((option) => option.id)).not.toContain(
      "liveavatar_managed",
    );
  });

  it("ignores legacy FULL and managed-voice environment configuration", () => {
    expect(
      readLiveVideoPlatformConfig({
        LIVEAVATAR_MODE: "full",
        LIVEAVATAR_VOICE_ID: "voice_1",
        LIVEAVATAR_CONTEXT_ID: "ctx_1",
        LIVEAVATAR_VOICE_AGENT_ID: "agent_1",
      } as NodeJS.ProcessEnv),
    ).toEqual(bareConfig);
  });

  it("resolves the active engine without degradation", () => {
    expect(resolveLiveVideoEngine({ config: bareConfig })).toEqual({
      mode: "lite",
      engine: "wireline_realtime",
      creditsPerMinute: 1,
      degradedFrom: null,
      reason: null,
    });
  });

  it("fails a stored managed-speech choice closed to BotBound audio", () => {
    expect(
      resolveLiveVideoEngine({
        requested: "liveavatar_managed",
        config: {
          allowedMode: "full",
          managedVoiceId: "voice_1",
          managedContextId: "ctx_1",
          managedVoiceAgentId: "agent_1",
        },
      }),
    ).toMatchObject({
      mode: "lite",
      engine: "wireline_realtime",
      creditsPerMinute: 1,
      degradedFrom: "liveavatar_managed",
      reason: expect.stringMatching(/retired.*OpenAI voice/i),
    });
  });

  it("fails every unknown alternate engine closed with an operator reason", () => {
    expect(resolveLiveVideoEngine({ requested: "alternate_speech", config: bareConfig })).toEqual({
      mode: "lite",
      engine: "wireline_realtime",
      creditsPerMinute: 1,
      degradedFrom: null,
      reason: "Only the BotBound OpenAI voice engine is supported.",
    });
  });
});

describe("live video session token payload", () => {
  const common = { avatarId: "avatar_1", sandbox: true, maxSessionDurationSeconds: 300 };

  it("builds the provider token in LITE mode", () => {
    expect(
      buildLiveVideoSessionTokenBody({
        ...common,
        resolution: resolveLiveVideoEngine({ config: bareConfig }),
        config: bareConfig,
      }),
    ).toEqual({
      mode: "LITE",
      avatar_id: "avatar_1",
      is_sandbox: true,
      video_settings: { quality: "high" },
      max_session_duration: 300,
    });
  });

  it("cannot be tricked into managed speech by a forged legacy resolution", () => {
    const forgedResolution: LiveVideoEngineResolution = {
      mode: "full",
      engine: "liveavatar_managed",
      creditsPerMinute: 2,
      degradedFrom: null,
      reason: null,
    };
    const body = buildLiveVideoSessionTokenBody({
      ...common,
      language: "es-MX",
      interactivity: "PUSH_TO_TALK",
      voiceIdOverride: "alternate-voice",
      resolution: forgedResolution,
      config: {
        allowedMode: "full",
        managedVoiceId: "voice_1",
        managedContextId: "ctx_1",
        managedVoiceAgentId: "agent_1",
      },
    });

    expect(body.mode).toBe("LITE");
    expect(body).not.toHaveProperty("voice_agent");
    expect(body).not.toHaveProperty("avatar_persona");
    expect(body).not.toHaveProperty("interactivity_type");
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
});

describe("legacy response compatibility", () => {
  it("keeps decoding old provider-owned FULL responses without sending duplicate audio", () => {
    expect(sessionExpectsWirelineAudio({ mode: "full", voiceEngine: "liveavatar_managed" })).toBe(
      false,
    );
  });

  it("drives audio for every newly resolved LITE session", () => {
    const resolution = resolveLiveVideoEngine({
      requested: "liveavatar_managed",
      config: bareConfig,
    });
    expect(
      sessionExpectsWirelineAudio({
        mode: resolution.mode,
        voiceEngine: resolution.engine,
      }),
    ).toBe(true);
  });

  it("lists only the active engine", () => {
    expect(describeLiveVideoEngines(bareConfig)).toEqual([
      expect.objectContaining({
        id: "wireline_realtime",
        available: true,
        reason: null,
      }),
    ]);
  });
});

describe("historical session allowance reconciliation", () => {
  it("reserves the current LITE session at the base rate", () => {
    expect(liveVideoSessionReservationMinutes()).toBe(LIVE_VIDEO_SESSION_RESERVATION_MINUTES);
    expect(liveVideoSessionReservationMinutes(1)).toBe(LIVE_VIDEO_SESSION_RESERVATION_MINUTES);
  });

  it("retains legacy two-credit arithmetic for old FULL accounting rows", () => {
    expect(liveVideoSessionReservationMinutes(2)).toBe(LIVE_VIDEO_SESSION_RESERVATION_MINUTES * 2);
  });

  it("clamps malformed historical rates", () => {
    expect(liveVideoSessionReservationMinutes(0)).toBe(LIVE_VIDEO_SESSION_RESERVATION_MINUTES);
    expect(liveVideoSessionReservationMinutes(-3)).toBe(LIVE_VIDEO_SESSION_RESERVATION_MINUTES);
    expect(liveVideoSessionReservationMinutes(Number.NaN)).toBe(
      LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
    );
    expect(liveVideoSessionReservationMinutes(99)).toBe(LIVE_VIDEO_SESSION_RESERVATION_MINUTES * 4);
  });
});
