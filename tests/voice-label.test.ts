import { describe, expect, it } from "vitest";
import { resolveVoiceLabel } from "../src/lib/voice-catalog";

describe("resolveVoiceLabel", () => {
  it("turns configured provider ids into friendly workspace labels", () => {
    expect(resolveVoiceLabel("PNInz6obpgDQGcFmaJgB")).toBe("Adam — Deep");
    expect(resolveVoiceLabel("ara")).toBe("Ara — Warm & Professional");
  });

  it("does not expose opaque provider ids to customers", () => {
    expect(resolveVoiceLabel("owned-voice-opaque-id")).toBe("Custom voice");
  });
});
