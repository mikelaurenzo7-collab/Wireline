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
      reason: "ChatGPT App private simulation only. Studio and PSTN stay on xAI Speech-to-Speech.",
    },
    reasoning_layer: {
      provider: "gateway" as const,
      model: STRUCTURED_PRIMARY_MODEL,
      reason: "AI Gateway owns structured-routing availability and observability for training, QA, insights, and post-call work.",
    },
    reasoning_fallback: {
      provider: "xai" as const,
      model: STRUCTURED_PRIMARY_MODEL,
      reason: "Gateway model chain starts with Grok, then OpenAI and Gemini for continuity.",
    },
  };
}

export type HealthModelTiering = ReturnType<typeof getHealthModelTiering>;
