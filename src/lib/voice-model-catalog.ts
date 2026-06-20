import {
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  VAPI_VOICE_FALLBACK_PROVIDER,
  WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL,
} from "./voice-model-defaults";

export type VoiceModelSpeed = "fastest" | "fast" | "balanced" | "heavy";
export type VapiVoiceProvider = "google" | "openai" | "openrouter";

export interface VoiceModelOption {
  provider: VapiVoiceProvider;
  model: string;
  label: string;
  speed: VoiceModelSpeed;
  envKey: string;
  latencyWarning?: boolean;
  note?: string;
  acceptsCustomModelId?: boolean;
}

export interface VapiVoiceModelSelection {
  provider: VapiVoiceProvider;
  model: string;
  fallbackModels?: string[];
  userSelected?: boolean;
}

export function isOpenRouterModelId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id || id.length > 160 || id.includes("..") || /\s/.test(id)) return false;
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
}

/**
 * Managed agents run Gemini by default. The outbound factory retries the
 * managed Gemini request once through OpenAI when Vapi rejects it. A valid
 * OpenRouter id is the one operator-controlled exception and is never silently
 * swapped for a different model.
 */
export function resolveVapiVoiceModelSelection(input?: {
  provider?: string | null;
  model?: string | null;
}): VapiVoiceModelSelection {
  const provider = String(input?.provider || "").trim().toLowerCase();
  const model = String(input?.model || "").trim();

  if (provider === "openrouter" && isOpenRouterModelId(model)) {
    return { provider: "openrouter", model, userSelected: true };
  }

  if (provider === "google" && model.toLowerCase().includes("gemini")) {
    return { provider: "google", model, userSelected: false };
  }

  return {
    provider: VAPI_TENANT_DEFAULT_PROVIDER as VapiVoiceProvider,
    model: VAPI_TENANT_DEFAULT_MODEL,
    userSelected: false,
  };
}

export const VOICE_MODEL_CATALOG: readonly VoiceModelOption[] = [
  {
    provider: "google",
    model: VAPI_TENANT_DEFAULT_MODEL,
    label: "Gemini Flash",
    speed: "fastest",
    envKey: "GEMINI_API_KEY",
    note: "Wireline default. Managed calls retry through OpenAI if Gemini is unavailable.",
  },
  {
    provider: "openrouter",
    model: WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL,
    label: "OpenRouter — choose a model",
    speed: "balanced",
    envKey: "OPENROUTER_API_KEY",
    latencyWarning: true,
    acceptsCustomModelId: true,
    note: "Advanced override. Enter a namespaced OpenRouter model ID for this agent.",
  },
] as const;

export { VAPI_TENANT_DEFAULT_MODEL, VAPI_TENANT_DEFAULT_PROVIDER };
export { VAPI_VOICE_FALLBACK_MODEL, VAPI_VOICE_FALLBACK_PROVIDER };

export function clampVoiceTemperature(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}
