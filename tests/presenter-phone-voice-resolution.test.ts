import { describe, expect, it } from "vitest";

import { resolvePresenterPhoneVoicePayload } from "../src/lib/voice-catalog";

describe("presenter phone voice resolution", () => {
  it("falls back to one valid Vapi id/provider pair for legacy empty rows", () => {
    expect(resolvePresenterPhoneVoicePayload(null, null)).toEqual({
      phoneVoiceId: "Elliot",
      phoneVoiceProvider: "vapi",
    });
    expect(resolvePresenterPhoneVoicePayload(null, "11labs")).toEqual({
      phoneVoiceId: "Elliot",
      phoneVoiceProvider: "vapi",
    });
  });

  it("preserves explicit pairs and safely infers legacy providers", () => {
    expect(resolvePresenterPhoneVoicePayload("Savannah", "vapi")).toEqual({
      phoneVoiceId: "Savannah",
      phoneVoiceProvider: "vapi",
    });
    expect(resolvePresenterPhoneVoicePayload("Savannah", null)).toEqual({
      phoneVoiceId: "Savannah",
      phoneVoiceProvider: "vapi",
    });
    expect(resolvePresenterPhoneVoicePayload("pNInz6obpgDQGcFmaJgB", null)).toEqual({
      phoneVoiceId: "pNInz6obpgDQGcFmaJgB",
      phoneVoiceProvider: "11labs",
    });
    expect(resolvePresenterPhoneVoicePayload("Savannah", "11labs")).toEqual({
      phoneVoiceId: "Savannah",
      phoneVoiceProvider: "vapi",
    });
    expect(resolvePresenterPhoneVoicePayload("pNInz6obpgDQGcFmaJgB", "vapi")).toEqual({
      phoneVoiceId: "pNInz6obpgDQGcFmaJgB",
      phoneVoiceProvider: "11labs",
    });
  });
});
