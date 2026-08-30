import { STRUCTURED_PRIMARY_MODEL } from "./ai-models";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "./voice/openai-realtime-config";

/**
 * Model/provider policy exposed by authenticated health diagnostics.
 *
 * Keep this derived from the same constants that build live OpenAI and
 * structured-runtime payloads. Health surfaces are operational truth, not a
 * second configuration source.
 */
export function getHealthModelTiering() {
  return {
    voice_runtime: {
      provider: "openai_realtime" as const,
      model: OPENAI_REALTIME_DEFAULT_MODEL,
      reason: "OpenAI Realtime for browser and Twilio-carried PSTN calls.",
    },
    voice_fallback: {
      provider: "none" as const,
      model: null,
      reason: "No second live-voice provider; calls fail closed without cross-provider duplication.",
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
      reason: "Continuity proceeds through AI Gateway and Gemini when configured.",
    },
  };
}

export type HealthModelTiering = ReturnType<typeof getHealthModelTiering>;
