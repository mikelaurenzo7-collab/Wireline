import { describe, expect, it } from "vitest";
import { resolveVoiceLabel } from "../src/lib/voice-catalog";

describe("resolveVoiceLabel", () => {
  it("turns configured provider ids into friendly workspace labels", () => {
    expect(resolveVoiceLabel("marin")).toBe("Marin · Natural & Expressive");
    expect(resolveVoiceLabel("coral")).toBe("Coral · Warm & Conversational");
  });

  it("does not expose opaque provider ids to customers", () => {
    expect(resolveVoiceLabel("owned-voice-opaque-id")).toBe("Unavailable voice");
  });
});
