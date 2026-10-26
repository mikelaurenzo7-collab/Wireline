import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INBOUND_SIP_REFER_PATH,
  XAI_CONNECT_TIMEOUT_SECONDS,
  inboundBridgeTwiml,
  openAIFailoverTwiml,
  redirectInboundCallToOpenAI,
  referTargetPhone,
  referTransferTwiml,
} from "../src/lib/voice/inbound-bridge";
import { composeInboundOpening, inboundDisclosureLine } from "../src/lib/voice/inbound-opening";
import {
  issueOpenAIInboundToken,
  verifyOpenAIInboundToken,
} from "../src/lib/voice/openai-inbound-token";
import { isRecoverableRealtimeError } from "../src/lib/voice/openai-sip-session";
import {
  OPENAI_TURN_AUDIO_START_EVENTS,
  OpenAISipTurnTiming,
  XAI_TURN_AUDIO_START_EVENTS,
} from "../src/lib/voice/openai-sip-turn-timing";
import { classifyXAICustomVoiceFailure } from "../src/lib/voice/xai-custom-voice-client";
import {
  BIOMETRIC_MAX_DAYS,
  biometricExpiresAt,
  biometricReleaseRecord,
  cloneEngineCandidates,
  noteXAICustomVoiceNotEntitled,
  resetXAICustomVoiceEntitlementForTests,
  xaiCustomVoiceApiEntitled,
} from "../src/lib/voice/clone-engine-selection";
import { staleXAIRegistrations } from "../src/lib/voice/xai-phone-registration";
import { readCloneDetailsHeader } from "../src/routes/cloned-voice-routes";
import { liveVoiceCloneEnabled } from "../src/lib/voice/live-voice-service";
import { mediaBridgeEngine } from "../src/lib/voice/cloned-call-routing";
import { DRILL_TTL_MS, isFallbackDrillMode } from "../src/lib/voice/fallback-drill";

const CALL_SID = `CA${"a".repeat(32)}`;
const OPENAI_ENV = {
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_PROJECT_ID: "proj_testtest1",
  OPENAI_WEBHOOK_SECRET: "test-webhook-secret",
  INTERNAL_JWT_SECRET: "x".repeat(40),
};

describe("transfer over SIP REFER", () => {
  it("extracts the E.164 number from tel and sip targets", () => {
    expect(referTargetPhone("tel:+14155550199")).toBe("+14155550199");
    expect(referTargetPhone("<sip:+14155550199@example.com;user=phone>")).toBe("+14155550199");
    expect(referTargetPhone("sip:alice@example.com")).toBeNull();
    expect(referTargetPhone("")).toBeNull();
  });

  it("dials the human and rejects malformed targets", () => {
    const twiml = referTransferTwiml("tel:+14155550199", "+13125550100")!;
    expect(twiml).toContain("<Number>+14155550199</Number>");
    expect(twiml).toContain('callerId="+13125550100"');
    expect(referTransferTwiml("sip:alice@example.com", null)).toBeNull();
  });

  it("every bridge Dial carries referUrl so Twilio does not reject REFER (13802)", () => {
    const twiml = inboundBridgeTwiml({ provider: "xai", uri: "sip:x@sip.example" } as never, false);
    expect(twiml).toContain(`referUrl="${INBOUND_SIP_REFER_PATH}"`);
    expect(twiml).toContain('referMethod="POST"');
  });
});

describe("same-call failover", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(OPENAI_ENV)) vi.stubEnv(key, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("gives the xAI leg a short connect timeout and names the leg in the action", () => {
    const twiml = inboundBridgeTwiml({ provider: "xai", uri: "sip:x@sip.example" } as never, true);
    expect(twiml).toContain(`timeout="${XAI_CONNECT_TIMEOUT_SECONDS}"`);
    expect(XAI_CONNECT_TIMEOUT_SECONDS).toBeLessThanOrEqual(10);
    expect(twiml).toContain("leg=xai");
  });

  it("builds an OpenAI bridge for the same caller with a signed leg token", () => {
    const twiml = openAIFailoverTwiml({
      twilioCallSid: CALL_SID,
      calledNumber: "+13125550100",
      callerNumber: "+14155550199",
      callRecordingEnabled: false,
      leg: "resume",
    });
    expect(twiml).toBeTruthy();
    expect(twiml).toContain("leg=openai");
    expect(twiml).toContain("proj_testtest1");
  });

  it("redirects the live call through the Twilio updater and reports refusal", async () => {
    const input = {
      twilioCallSid: CALL_SID,
      calledNumber: "+13125550100",
      callerNumber: null,
      callRecordingEnabled: false,
      leg: "resume" as const,
      reason: "xai_session_error",
      callId: "call-1",
    };
    const updater = vi.fn(async () => ({}));
    await expect(redirectInboundCallToOpenAI(input, updater)).resolves.toBe(true);
    expect(updater).toHaveBeenCalledWith(CALL_SID, expect.stringContaining("<Dial"));
    const refused = vi.fn(async () => {
      throw new Error("call ended");
    });
    await expect(redirectInboundCallToOpenAI(input, refused)).resolves.toBe(false);
  });

  it("returns false instead of throwing when OpenAI is not configured", async () => {
    vi.stubEnv("OPENAI_PROJECT_ID", "");
    const updater = vi.fn(async () => ({}));
    await expect(
      redirectInboundCallToOpenAI(
        {
          twilioCallSid: CALL_SID,
          calledNumber: "+13125550100",
          callerNumber: null,
          callRecordingEnabled: false,
          leg: "failover",
          reason: "xai_connect",
          callId: "call-2",
        },
        updater,
      ),
    ).resolves.toBe(false);
    expect(updater).not.toHaveBeenCalled();
  });

  it("round-trips the leg and drill claims in the inbound token", () => {
    const env = { ...process.env, ...OPENAI_ENV };
    const leg = issueOpenAIInboundToken({
      twilioCallSid: CALL_SID,
      calledNumber: "+13125550100",
      leg: "resume",
      env,
    });
    const verified = verifyOpenAIInboundToken(leg.token, { env });
    expect(verified.ok).toBe(true);
    expect(verified.ok && verified.claims.leg).toBe("resume");
    const drill = issueOpenAIInboundToken({
      twilioCallSid: CALL_SID,
      calledNumber: "+13125550100",
      drill: "xai_session",
      env,
    });
    expect(drill.claims.drill).toBe("xai_session");
    expect(() =>
      issueOpenAIInboundToken({
        twilioCallSid: CALL_SID,
        calledNumber: "+13125550100",
        env: { ...env, INTERNAL_JWT_SECRET: "short" },
      }),
    ).toThrow();
  });

  it("tool and rate-limit errors keep the session; others fail over", () => {
    expect(isRecoverableRealtimeError({ error: { type: "rate_limit_exceeded" } })).toBe(true);
    expect(
      isRecoverableRealtimeError({
        error: { param: "call_id", message: "bad" },
      }),
    ).toBe(true);
    expect(isRecoverableRealtimeError({ error: { type: "server_error" } })).toBe(false);
  });
});

describe("greeting discloses AI first", () => {
  it("weaves the recording notice into the disclosure", () => {
    const line = inboundDisclosureLine({
      agentName: "Ava",
      recordingEnabled: true,
    });
    expect(line).toMatch(/^Hi, you're speaking with an AI assistant/);
    expect(line).toContain("may be recorded");
  });

  it("leads with the disclosure and keeps the owner's greeting", () => {
    const opening = composeInboundOpening({
      greeting: "Thanks for calling Joe's Plumbing! How can I help?",
      agentName: "Ava",
      businessName: "Joe's Plumbing",
      recordingEnabled: false,
    });
    expect(opening.startsWith("Hi, you're speaking with an AI assistant")).toBe(true);
    expect(opening).toContain("How can I help?");
  });

  it("a resumed leg discloses again without replaying the greeting", () => {
    const opening = composeInboundOpening({
      greeting: "Thanks for calling Joe's Plumbing!",
      agentName: "Ava",
      recordingEnabled: true,
      leg: "resume",
    });
    expect(opening).toMatch(/^You're still speaking with an AI assistant/);
    expect(opening).not.toContain("Thanks for calling");
  });
});

describe("first-audio timing", () => {
  it("labels playback for OpenAI and generation for xAI", () => {
    expect(
      new OpenAISipTurnTiming({
        audioStartEvents: OPENAI_TURN_AUDIO_START_EVENTS,
      }).summary().firstAudioSignal,
    ).toBe("playback");
    expect(
      new OpenAISipTurnTiming({
        audioStartEvents: XAI_TURN_AUDIO_START_EVENTS,
      }).summary().firstAudioSignal,
    ).toBe("generation");
  });
});

describe("clone engine selection", () => {
  afterEach(() => {
    resetXAICustomVoiceEntitlementForTests();
    vi.unstubAllEnvs();
  });

  it("maps xAI 403 Enterprise and 400 limit to clear codes", () => {
    expect(classifyXAICustomVoiceFailure(403, "Requires an Enterprise plan")).toBe("not_entitled");
    expect(classifyXAICustomVoiceFailure(400, "Custom voice limit reached")).toBe("limit_reached");
    expect(classifyXAICustomVoiceFailure(400, "audio too short")).toBe("rejected_audio");
  });

  it("caches a not-entitled answer and retries xAI later", () => {
    const now = 1_000_000;
    expect(xaiCustomVoiceApiEntitled({}, now)).toBe(true);
    noteXAICustomVoiceNotEntitled(now);
    expect(xaiCustomVoiceApiEntitled({}, now + 60_000)).toBe(false);
    expect(xaiCustomVoiceApiEntitled({}, now + 7 * 3_600_000)).toBe(true);
    expect(xaiCustomVoiceApiEntitled({ XAI_CUSTOM_VOICES_API_ENABLED: "false" }, now)).toBe(false);
  });

  it("uses ElevenLabs for every speaker and no second clone vendor", () => {
    const base = {
      xai: {
        configured: true,
        entitled: true,
        teamVoicesUsed: 0,
        teamLimit: 30,
      },
      elevenlabs: { configured: true },
    };
    expect(cloneEngineCandidates({ ...base, jurisdiction: "US-IL" })).toEqual(["elevenlabs"]);
    expect(cloneEngineCandidates({ ...base, jurisdiction: "US-CA" })).toEqual(["elevenlabs"]);
    expect(cloneEngineCandidates({ ...base, jurisdiction: "INTL" })).toEqual(["elevenlabs"]);
    expect(
      cloneEngineCandidates({
        ...base,
        jurisdiction: "US-CA",
        elevenlabs: { configured: false },
      }),
    ).toEqual([]);
  });

  it("requires explicit opt-in and a callable ElevenLabs phone path", () => {
    const ready = {
      LIVE_VOICE_CLONE_ENABLED: "true",
      ELEVENLABS_API_KEY: "test-eleven-key",
      OPENAI_API_KEY: "test-openai-key",
      WIRELINE_VOICE_WORKER_URL: "https://voice.botbound.app",
    };
    expect(liveVoiceCloneEnabled({ ...ready, LIVE_VOICE_CLONE_ENABLED: "" })).toBe(false);
    expect(liveVoiceCloneEnabled(ready)).toBe(true);
    expect(liveVoiceCloneEnabled({ ...ready, ELEVENLABS_API_KEY: "" })).toBe(false);
    expect(liveVoiceCloneEnabled({ ...ready, OPENAI_API_KEY: "" })).toBe(false);
    expect(liveVoiceCloneEnabled({ ...ready, WIRELINE_VOICE_WORKER_URL: "" })).toBe(false);
    expect(liveVoiceCloneEnabled({ ...ready, LIVE_VOICE_CLONE_ENABLED: "false" })).toBe(false);
  });

  it("plays an ElevenLabs clone only when that phone path is configured", () => {
    expect(
      mediaBridgeEngine({
        customEngine: "elevenlabs",
        catalogEngine: null,
        elevenLabsCalls: true,
        catalogCalls: true,
      }),
    ).toBe("elevenlabs");
    expect(
      mediaBridgeEngine({
        customEngine: "elevenlabs",
        catalogEngine: "cartesia",
        elevenLabsCalls: false,
        catalogCalls: true,
      }),
    ).toBeNull();
    expect(
      mediaBridgeEngine({
        customEngine: "xai",
        catalogEngine: null,
        elevenLabsCalls: true,
        catalogCalls: true,
      }),
    ).toBeNull();
    expect(
      mediaBridgeEngine({
        customEngine: "unavailable",
        catalogEngine: "cartesia",
        elevenLabsCalls: false,
        catalogCalls: true,
      }),
    ).toBeNull();
    expect(
      mediaBridgeEngine({
        customEngine: null,
        catalogEngine: "cartesia",
        elevenLabsCalls: false,
        catalogCalls: true,
      }),
    ).toBe("cartesia");
  });
});

describe("consent and retention", () => {
  it("never keeps a voice past three years", () => {
    const created = new Date("2026-10-24T00:00:00Z");
    const recentUse = new Date(created.getTime() + 1_090 * 86_400_000);
    const expires = biometricExpiresAt(created, recentUse);
    expect(expires.getTime() - created.getTime()).toBeLessThanOrEqual(
      BIOMETRIC_MAX_DAYS * 86_400_000,
    );
    expect(BIOMETRIC_MAX_DAYS).toBeLessThanOrEqual(3 * 365);
  });

  it("the stored release discloses provider processing and fits the schema", () => {
    const record = biometricReleaseRecord("Ava");
    expect(record).toMatch(/voice provider/i);
    expect(record).not.toMatch(/authorized|on behalf of/i);
    expect(record.length).toBeGreaterThanOrEqual(200);
    expect(record.length).toBeLessThanOrEqual(8_000);
    expect(record).not.toMatch(/xAI|Grok|ElevenLabs|OpenAI|Wireline/);
  });

  it("clone details travel in a header, never the query string", () => {
    const details = {
      name: "My voice",
      signedName: "Jane Q Public",
      consent: true,
    };
    expect(readCloneDetailsHeader(encodeURIComponent(JSON.stringify(details)))).toEqual(details);
    expect(readCloneDetailsHeader("%E0%A4%A")).toEqual({});
    expect(readCloneDetailsHeader("x".repeat(2_001))).toEqual({});
  });
});

describe("xAI phone registration race", () => {
  it("never deletes a registration younger than 60 seconds", () => {
    const now = 10_000_000;
    const rows = [
      { id: "fresh", phoneNumber: "+13125550100", createdAtMs: now - 5_000 },
      { id: "stale", phoneNumber: "+13125550100", createdAtMs: now - 120_000 },
      { id: "unknown", phoneNumber: "+13125550100", createdAtMs: null },
      { id: "other", phoneNumber: "+13125550101", createdAtMs: now - 120_000 },
    ];
    expect(staleXAIRegistrations(rows, "+13125550100", now).map((r) => r.id)).toEqual([
      "stale",
      "unknown",
    ]);
  });
});

describe("fallback drill", () => {
  it("accepts only the three drill modes and expires within 15 minutes", () => {
    expect(isFallbackDrillMode("xai_connect")).toBe(true);
    expect(isFallbackDrillMode("clone_voice")).toBe(true);
    expect(isFallbackDrillMode("everything")).toBe(false);
    expect(DRILL_TTL_MS).toBe(15 * 60_000);
  });
});

describe("Codex #1360 review fixes", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("reserves the account cap under a lock before any provider is contacted", () => {
    const service = read("src/lib/voice/live-voice-service.ts");
    const lock = service.indexOf("live_voice_cap:");
    const create = service.indexOf("await engine.create(");
    expect(lock).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(lock);
  });

  it("keeps durable cleanup evidence when a provider delete fails", () => {
    const service = read("src/lib/voice/live-voice-service.ts");
    expect(service).toContain('status: "cleanup_pending"');
    expect(service).toContain('inArray(liveVoices.status, ["ready", "cleanup_pending"])');
    expect(read("drizzle/migrations/0186_live_voice_clones.sql")).toContain("'cleanup_pending'");
  });

  it("cancel invalidates a pending microphone request", () => {
    const studio = read("src/components/voice/LiveVoiceCloneStudio.tsx");
    const cancel = studio.slice(studio.lastIndexOf("generation.current += 1;"));
    expect(cancel.indexOf("releaseCapture();")).toBeGreaterThan(-1);
    expect(cancel.indexOf("Cancel")).toBeGreaterThan(cancel.indexOf("releaseCapture();"));
  });

  it("choosing a built-in voice clears the cloned voice it would otherwise hide", () => {
    const route = read("src/routes/agent-routes-v2.ts");
    expect(route).toContain("delete variables[LIVE_CUSTOM_VOICE_KEY]");
    expect(route).toContain("customVoiceCleared,");
    expect(read("src/components/voice/SimpleVoicePicker.tsx")).toContain(
      "if (body?.customVoiceCleared)",
    );
  });
});
