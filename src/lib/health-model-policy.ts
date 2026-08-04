import {
  GEMINI_STRUCTURED_FALLBACK_MODEL,
  STRUCTURED_PRIMARY_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  VAPI_VOICE_FALLBACK_PROVIDER,
} from "./ai-models";

/**
 * Model/provider policy exposed by authenticated health diagnostics.
 *
 * Keep this derived from the same constants that build live Vapi and
 * structured-runtime payloads. Health surfaces are operational truth, not a
 * second configuration source.
 */
export function getHealthModelTiering() {
  return {
    voice_runtime: {
      provider: VAPI_TENANT_DEFAULT_PROVIDER,
      model: VAPI_TENANT_DEFAULT_MODEL,
      reason: "Managed low-latency Vapi model.",
    },
    voice_fallback: {
      provider: VAPI_VOICE_FALLBACK_PROVIDER,
      model: VAPI_VOICE_FALLBACK_MODEL,
      reason: "Managed same-provider voice fallback.",
    },
    reasoning_layer: {
      provider: "openai" as const,
      model: STRUCTURED_PRIMARY_MODEL,
      reason:
        "Managed OpenAI Responses primary for training, QA, insights, and post-call work.",
    },
    reasoning_fallback: {
      provider: "google" as const,
      model: GEMINI_STRUCTURED_FALLBACK_MODEL,
      reason: "First automatic fallback; the AI Gateway follows.",
    },
  };
}

export type HealthModelTiering = ReturnType<typeof getHealthModelTiering>;
