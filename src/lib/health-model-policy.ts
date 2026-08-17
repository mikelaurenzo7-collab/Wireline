import {
  OPENAI_STRUCTURED_PRIMARY_MODEL,
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
      reason: "Application-layer OpenAI retry after a rejected xAI Vapi model.",
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
