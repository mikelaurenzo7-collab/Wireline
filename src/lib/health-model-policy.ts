import {
  OPENAI_STRUCTURED_PRIMARY_MODEL,
  STRUCTURED_PRIMARY_MODEL,
} from "./ai-models";
import { GROK_VOICE_DEFAULT_MODEL } from "./voice/grok-voice-config";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "./voice/openai-realtime-config";

/**
 * Model/provider policy exposed by authenticated health diagnostics.
 *
 * Keep this derived from the same constants that build live native SIP and
 * structured-runtime payloads. Health surfaces are operational truth, not a
 * second configuration source.
 */
export function getHealthModelTiering() {
  return {
    voice_runtime: {
      provider: "xai" as const,
      model: GROK_VOICE_DEFAULT_MODEL,
      reason: "Native Twilio + xAI Direct SIP Speech-to-Speech.",
    },
    voice_fallback: {
      provider: "openai" as const,
      model: OPENAI_REALTIME_DEFAULT_MODEL,
      reason: "ChatGPT widget and browser backup. Native PSTN does not fail over to Vapi.",
    },
    reasoning_layer: {
      provider: "xai" as const,
      model: STRUCTURED_PRIMARY_MODEL,
      reason: "Managed xAI Grok 4.6 primary for training, QA, insights, and post-call work.",
    },
    reasoning_fallback: {
      provider: "openai" as const,
      model: OPENAI_STRUCTURED_PRIMARY_MODEL,
      reason: "First automatic continuity lane; Gemini and the AI Gateway follow.",
    },
  };
}

export type HealthModelTiering = ReturnType<typeof getHealthModelTiering>;
