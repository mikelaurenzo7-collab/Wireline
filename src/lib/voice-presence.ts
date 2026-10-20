/**
 * One vocabulary for private rehearsal and a live test call.
 * Rehearsal can show the live acoustic state. A phone test cannot see
 * that audio, so a connected call uses the same words without inventing a waveform.
 */
export const VOICE_PRESENCE = {
  listening: "Listening",
  speaking: "Bot Speaking",
  thinking: "Checking Approved Knowledge",
} as const;

export function connectedCallPresence(): string {
  return `${VOICE_PRESENCE.listening}. ${VOICE_PRESENCE.speaking} when it is the Bot's turn.`;
}
