import { OPENAI_STRUCTURED_PRIMARY_MODEL, STRUCTURED_PRIMARY_MODEL } from "./ai-models";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "./voice/openai-realtime-config";
import { configuredPhoneVoiceProvider } from "./voice/realtime-provider";
import { resolveXAIGrokVoiceModel } from "./voice/xai-voice-config";
import { xaiSipConfigured } from "./voice/xai-sip-config";

/**
 * Model/provider policy exposed by authenticated health diagnostics.
 *
 * Keep this derived from the same constants that build live voice and
 * structured-runtime payloads. Health surfaces are operational truth, not a
 * second configuration source.
 */
export function getHealthModelTiering() {
  // The runtime calls actually use: xAI is chosen, but without its SIP
  // configuration every call answers on OpenAI, and health says so.
  const xaiChosen = configuredPhoneVoiceProvider() === "xai";
  const phoneOnXAI = xaiChosen && xaiSipConfigured();
  return {
    voice_runtime: {
      configured_provider: xaiChosen ? ("xai_voice" as const) : ("openai_realtime" as const),
      provider: phoneOnXAI ? ("xai_voice" as const) : ("openai_realtime" as const),
      model: phoneOnXAI ? resolveXAIGrokVoiceModel() : OPENAI_REALTIME_DEFAULT_MODEL,
      reason: phoneOnXAI
        ? "xAI voice is the default for every Twilio-carried PSTN call; lines register with xAI automatically."
        : "OpenAI Realtime for browser and Twilio-carried PSTN calls.",
    },
    voice_fallback: {
      provider: phoneOnXAI ? ("openai_realtime" as const) : ("none" as const),
      model: phoneOnXAI ? OPENAI_REALTIME_DEFAULT_MODEL : null,
      reason: phoneOnXAI
        ? "OpenAI Realtime answers only when xAI is unavailable or a line is still finishing its automatic xAI registration."
        : "No second live-voice provider; calls fail closed without cross-provider duplication.",
    },
    reasoning_layer: {
      provider: "xai" as const,
      model: STRUCTURED_PRIMARY_MODEL,
      reason:
        "xAI owns managed structured reasoning for training, QA, insights, and post-call work.",
    },
    reasoning_fallback: {
      provider: "openai" as const,
      model: OPENAI_STRUCTURED_PRIMARY_MODEL,
      reason: "OpenAI is the structured backup; the legacy AI Gateway follows when configured.",
    },
  };
}

export type HealthModelTiering = ReturnType<typeof getHealthModelTiering>;
