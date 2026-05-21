import { describe, expect, it } from "vitest";
import { getVoiceLatencyProfile } from "./voice-agent-profile";

describe("getVoiceLatencyProfile", () => {
  it("uses shorter silence for paid sales outbound", () => {
    const profile = getVoiceLatencyProfile({
      aiTier: "pro",
      archetype: "The Closer",
      role: "sales",
      isOutbound: true,
    });
    expect(profile.silenceTimeoutSeconds).toBeLessThanOrEqual(2);
    expect(profile.optimizeStreamingLatency).toBe(4);
    expect(profile.numWordsToInterruptAssistant).toBe(2);
  });

  it("keeps starter tier slightly more patient", () => {
    const profile = getVoiceLatencyProfile({
      aiTier: "starter",
      archetype: "Receptionist",
      role: "customer_service",
    });
    expect(profile.silenceTimeoutSeconds).toBeGreaterThanOrEqual(4);
    expect(profile.optimizeStreamingLatency).toBe(3);
  });
});
