/**
 * Permission to send the account holder's own recording to ElevenLabs.
 * Keep this separate from the local Nano pilot and from any future live-call consent.
 * The server must also record the authenticated actor, accepted time and source fingerprint.
 */
export const ELEVENLABS_CLONE_CONSENT_VERSION =
  "elevenlabs-self-speaker-private-preview-v1-2026-10-17";
export const ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_VERSION =
  "elevenlabs-provider-retention-ack-v1-2026-10-17";
export const ELEVENLABS_CLONE_INTENDED_USE = "private_preview" as const;

export const ELEVENLABS_CLONE_CONSENT_TEXT =
  "I am the speaker in this recording. I authorize BotBound to send it to ElevenLabs to create and store my private voice clone and generate private previews. This does not authorize my cloned voice for live calls.";

/**
 * This versions an acknowledgement, not a published retention policy or period.
 * Present the actual provider-retention information before asking for acceptance.
 */
export const ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_TEXT =
  "I have reviewed the provider-retention information shown before upload. I understand that ElevenLabs receives my recording and processes generated audio, and that deleting a saved BotBound voice does not by itself confirm erasure of all provider-held data.";

export type ElevenLabsCloneConsentInput = {
  consentAccepted: true;
  consentVersion: typeof ELEVENLABS_CLONE_CONSENT_VERSION;
  retentionAcknowledged: true;
  retentionAcknowledgementVersion: typeof ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_VERSION;
};

/** The recording must be a bounded multipart file, not a large JSON/base64 field. */
export type ElevenLabsCloneCreateFields = ElevenLabsCloneConsentInput & {
  name: string;
  sourceSha256: string;
};

/** A current private-preview acknowledgement grants no live-call authority. */
export function hasCurrentElevenLabsCloneConsent(
  value: unknown,
): value is ElevenLabsCloneConsentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    input.consentAccepted === true &&
    input.consentVersion === ELEVENLABS_CLONE_CONSENT_VERSION &&
    input.retentionAcknowledged === true &&
    input.retentionAcknowledgementVersion === ELEVENLABS_CLONE_RETENTION_ACKNOWLEDGEMENT_VERSION
  );
}
