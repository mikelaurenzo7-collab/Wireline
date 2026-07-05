import { describe, expect, it } from "vitest";
import {
  applyVapiListenControlMessage,
  isVapiAssistantSpeaking,
  parseVapiListenControlMessage,
  setVapiAssistantSpeaking,
} from "../src/lib/vapi-listen-gate";

describe("vapi listen gate", () => {
  it("opens the gate on assistant speech-update start", () => {
    const payload = JSON.stringify({ type: "speech-update", role: "assistant", status: "started" });
    expect(parseVapiListenControlMessage(payload)).toBe(true);
    expect(applyVapiListenControlMessage("call-1", payload)).toBe(true);
    expect(isVapiAssistantSpeaking("call-1")).toBe(true);
  });

  it("closes the gate on assistant speech-update stop", () => {
    setVapiAssistantSpeaking("call-2", true);
    const payload = JSON.stringify({ type: "speech-update", role: "assistant", status: "stopped" });
    expect(applyVapiListenControlMessage("call-2", payload)).toBe(false);
    expect(isVapiAssistantSpeaking("call-2")).toBe(false);
  });

  it("ignores unrelated JSON frames", () => {
    expect(parseVapiListenControlMessage(JSON.stringify({ type: "ping" }))).toBeNull();
  });
});
