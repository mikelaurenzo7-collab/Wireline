import { describe, expect, it } from "vitest";

import {
  ELEVENLABS_CLONE_CONSENT_TEXT,
  ELEVENLABS_CLONE_CONSENT_VERSION,
  ELEVENLABS_CLONE_INTENDED_USE,
  ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_TEXT,
  ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_VERSION,
  hasCurrentElevenLabsCloneConsent,
} from "../src/lib/elevenlabs-clone-contract";
import { VOICE_ASSET_CONSENT_VERSION } from "../src/lib/voice-clone-contract";

const accepted = {
  consentAccepted: true,
  consentVersion: ELEVENLABS_CLONE_CONSENT_VERSION,
  retentionAcknowledged: true,
  retentionAcknowledgementVersion: ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_VERSION,
};

describe("explicit ElevenLabs private-preview permission", () => {
  it("names the speaker, external destination, storage and private use without authorizing calls", () => {
    expect(ELEVENLABS_CLONE_CONSENT_TEXT).toContain("I am the speaker");
    expect(ELEVENLABS_CLONE_CONSENT_TEXT).toContain("send it to ElevenLabs");
    expect(ELEVENLABS_CLONE_CONSENT_TEXT).toContain("create and store my private voice clone");
    expect(ELEVENLABS_CLONE_CONSENT_TEXT).toContain(
      "does not authorize my cloned voice for live calls",
    );
    expect(ELEVENLABS_CLONE_INTENDED_USE).toBe("private_preview");
    expect(ELEVENLABS_CLONE_CONSENT_VERSION).not.toBe(VOICE_ASSET_CONSENT_VERSION);
  });

  it("requires separately versioned retention acknowledgement without inventing a period", () => {
    expect(ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_VERSION).not.toBe(
      ELEVENLABS_CLONE_CONSENT_VERSION,
    );
    expect(ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_TEXT).toContain(
      "provider-retention information shown before upload",
    );
    expect(ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_TEXT).toContain(
      "does not by itself confirm erasure",
    );
    expect(ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_TEXT).not.toMatch(
      /\d+\s*(day|hour|month)|zero.retention|never stored/i,
    );
  });

  it("accepts only the current explicit permissions", () => {
    expect(hasCurrentElevenLabsCloneConsent(accepted)).toBe(true);
    for (const patch of [
      { consentAccepted: false },
      { consentAccepted: "true" },
      { consentVersion: VOICE_ASSET_CONSENT_VERSION },
      { consentVersion: "old" },
      { retentionAcknowledged: false },
      { retentionAcknowledged: "true" },
      { retentionAcknowledgementVersion: "old" },
      { retentionAcknowledgementVersion: undefined },
    ])
      expect(hasCurrentElevenLabsCloneConsent({ ...accepted, ...patch })).toBe(false);
  });

  it.each([null, undefined, false, 1, [], "accepted", {}])(
    "refuses absent or malformed permissions %j",
    (value) => {
      expect(hasCurrentElevenLabsCloneConsent(value)).toBe(false);
    },
  );
});
