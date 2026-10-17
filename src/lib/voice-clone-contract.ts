/** Version the speaker's permission separately from model/provider configuration. */
export const VOICE_ASSET_CONSENT_VERSION = "voice-reference-self-speaker-v1-2026-10-17";

export const VOICE_CLONE_CONSENT_TEXT =
  "I am the speaker in this recording. I authorize BotBound to store and process it to generate a private synthetic-voice preview. This does not enable my voice for live calls.";

export type VoiceCloneCreateInput = {
  name: string;
  referenceAudioBase64: string;
  consentAccepted: true;
  consentVersion: string;
};
