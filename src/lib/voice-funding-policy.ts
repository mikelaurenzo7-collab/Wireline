/** Shared customer-facing policy; no server dependencies. */
export const VOICE_COMPLETION_GRACE_MINUTES = 10;

export type VoiceCallPolicy = "bounded_completion_grace" | "finish_current_block_next";
