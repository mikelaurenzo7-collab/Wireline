import { STRUCTURED_PRIMARY_MODEL } from "./ai-models";
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
      reason: "Studio and ChatGPT private browser simulations. PSTN stays on xAI Speech-to-Speech.",
    },
    reasoning_layer: {
      provider: "openai" as const,
      model: STRUCTURED_PRIMARY_MODEL,
      reason:
        "OpenAI owns managed structured reasoning for training, QA, insights, and post-call work.",
    },
    reasoning_fallback: {
      provider: "gateway" as const,
      model: STRUCTURED_PRIMARY_MODEL,
      reason: "Continuity proceeds through AI Gateway, xAI, and Gemini when configured.",
    },
  };
}

export type HealthModelTiering = ReturnType<typeof getHealthModelTiering>;
