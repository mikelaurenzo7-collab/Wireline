export type VoiceRuntimeProvider = "vapi_flux" | "openai_realtime" | "gemini_live";

export interface VoiceRuntimeStackStatus {
  provider: VoiceRuntimeProvider;
  label: string;
  role: "primary" | "fallback" | "candidate";
  configured: boolean;
  notes: string;
}

export function getVoiceRuntimePolicyStatus(): {
  primary: VoiceRuntimeStackStatus;
  fallback: VoiceRuntimeStackStatus;
  candidateFallbacks: VoiceRuntimeStackStatus[];
} {
  return {
    primary: {
      provider: "vapi_flux",
      label: "Vapi + Deepgram Flux",
      role: "primary",
      configured: Boolean(process.env.VAPI_PRIVATE_KEY?.trim() || process.env.VAPI_API_KEY?.trim()),
      notes: "Production phone stack. Deepgram Flux owns end-of-turn detection and remains the default telephony STT path.",
    },
    fallback: {
      provider: "openai_realtime",
      label: "OpenAI Realtime",
      role: "fallback",
      configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      notes: "Fallback and beta realtime voice runtime. Used for browser demos, premium beta, and recovery paths, not as the default phone stack.",
    },
    candidateFallbacks: [
      {
        provider: "gemini_live",
        label: "Gemini Live API",
        role: "candidate",
        configured: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()),
        notes: "Future tertiary fallback candidate. Keep disabled until explicit Gemini Live routing and spend controls are added.",
      },
    ],
  };
}
