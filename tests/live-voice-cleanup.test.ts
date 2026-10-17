import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hangup: vi.fn() }));
vi.mock("../src/lib/voice/openai-realtime-call-control", () => ({
  hangupOpenAIRealtimeCall: mocks.hangup,
}));

import {
  createLiveVoiceCleanupIssuer,
  verifyLiveVoiceCleanupToken,
} from "../src/lib/voice/live-voice-cleanup-token";
import { stopOpenAILiveVoiceCall } from "../src/lib/voice/live-voice-cleanup";

const NOW = Date.UTC(2026, 9, 17, 12, 0);
const input = {
  userId: "owner-a",
  agentId: "bot-a",
  callId: "rtc_test_123",
  keyFingerprint: "a".repeat(24),
  maxDurationSeconds: 300,
  nowMs: NOW,
};

describe("private voice cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_JWT_SECRET", "test-private-voice-cleanup-secret-1234567890");
    vi.stubEnv("SUPABASE_JWT_SECRET", "");
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.hangup.mockReset();
    mocks.hangup.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("ends only the signed call using the credential that created it", async () => {
    const token = createLiveVoiceCleanupIssuer()(input);
    await expect(
      stopOpenAILiveVoiceCall({ userId: input.userId, cleanupToken: token }),
    ).resolves.toEqual({ stopped: true });
    expect(mocks.hangup).toHaveBeenCalledWith({
      callId: input.callId,
      keyPurpose: "runtime",
      keySource: "runtime",
      expectedKeyFingerprint: input.keyFingerprint,
    });
    // Repeated stop is safe: the provider control treats terminal calls as success.
    await expect(
      stopOpenAILiveVoiceCall({ userId: input.userId, cleanupToken: token }),
    ).resolves.toEqual({ stopped: true });
  });

  it("rejects another account's ticket without contacting the provider", async () => {
    const token = createLiveVoiceCleanupIssuer()(input);
    await expect(
      stopOpenAILiveVoiceCall({ userId: "owner-b", cleanupToken: token }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.hangup).not.toHaveBeenCalled();
  });

  it("hides call, Bot, owner and key metadata and rejects modified encrypted parts", () => {
    const token = createLiveVoiceCleanupIssuer()(input);
    const parts = token.split(".");
    const decoded = parts.map((part) => Buffer.from(part, "base64url").toString("utf8")).join("");
    for (const value of [input.callId, input.agentId, input.userId, input.keyFingerprint]) {
      expect(decoded).not.toContain(value);
    }
    for (let index = 0; index < parts.length; index += 1) {
      const changed = [...parts];
      const bytes = Buffer.from(changed[index], "base64url");
      bytes[0] ^= 1;
      changed[index] = bytes.toString("base64url");
      expect(verifyLiveVoiceCleanupToken(changed.join("."), { userId: input.userId })).toBeNull();
    }
    expect(createLiveVoiceCleanupIssuer()(input)).not.toBe(token);
  });

  it("rejects malformed, expired and future-issued tickets", () => {
    const token = createLiveVoiceCleanupIssuer()(input);
    expect(
      verifyLiveVoiceCleanupToken(token, { userId: input.userId, nowMs: NOW + 600_000 }),
    ).toBeNull();
    expect(
      verifyLiveVoiceCleanupToken(token, { userId: input.userId, nowMs: NOW - 61_000 }),
    ).toBeNull();
    for (const invalid of ["", "x.y", `${token}.extra`, "x".repeat(2_049)]) {
      expect(verifyLiveVoiceCleanupToken(invalid, { userId: input.userId })).toBeNull();
    }
  });

  it("does not claim the server stopped after provider cleanup fails", async () => {
    const token = createLiveVoiceCleanupIssuer()(input);
    mocks.hangup.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(
      stopOpenAILiveVoiceCall({ userId: input.userId, cleanupToken: token }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("automatic deadline"),
    });
  });

  it("requires configured signing before issuing a ticket", () => {
    vi.stubEnv("INTERNAL_JWT_SECRET", "");
    expect(() => createLiveVoiceCleanupIssuer()).toThrow("JWT_SECRET_NOT_CONFIGURED");
  });
});
