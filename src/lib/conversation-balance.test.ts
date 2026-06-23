import { describe, expect, it } from "vitest";
import {
  CONVERSATION_BALANCE_MIN_USD,
  CONVERSATION_BALANCE_PRESETS_USD,
  CHANNEL_UNIT_COST_USD,
  estimateConversationCostUsd,
  canStartLiveConversation,
} from "./conversation-balance";

describe("conversation-balance", () => {
  it("starts the on-demand ladder at $5 with the approved presets", () => {
    expect(CONVERSATION_BALANCE_MIN_USD).toBe(5);
    expect([...CONVERSATION_BALANCE_PRESETS_USD]).toEqual([5, 10, 25, 50]);
  });

  it("weights channels so voice costs more than text and premium costs most", () => {
    expect(CHANNEL_UNIT_COST_USD.email_draft).toBeLessThan(CHANNEL_UNIT_COST_USD.email_send);
    expect(CHANNEL_UNIT_COST_USD.email_send).toBeLessThan(CHANNEL_UNIT_COST_USD.sms_send);
    expect(CHANNEL_UNIT_COST_USD.sms_send).toBeLessThan(CHANNEL_UNIT_COST_USD.voice_standard);
    expect(CHANNEL_UNIT_COST_USD.voice_standard).toBeLessThan(CHANNEL_UNIT_COST_USD.voice_premium);
  });

  it("estimates a short voice task with a higher pause cap", () => {
    const est = estimateConversationCostUsd({ channel: "voice_standard", voiceMinutes: 5 });
    expect(est.estimate_usd).toBeGreaterThan(0);
    expect(est.cap_usd).toBeGreaterThanOrEqual(est.estimate_usd);
    // The cap is never below the $2 floor so a tiny task still has headroom.
    expect(est.cap_usd).toBeGreaterThanOrEqual(2);
  });

  it("lets a $5 balance start a small task but blocks a zero balance", () => {
    const est = estimateConversationCostUsd({ channel: "email_send", messages: 3 });
    expect(canStartLiveConversation(5, est)).toBe(true);
    expect(canStartLiveConversation(0, est)).toBe(false);
  });
});
