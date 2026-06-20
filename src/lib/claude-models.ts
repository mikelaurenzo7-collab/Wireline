/**
 * Runtime model catalog.
 *
 * This file keeps its historical import path while the runtime itself is now
 * provider-neutral: Gemini is managed primary, OpenAI is automatic fallback,
 * and OpenRouter is an explicit per-agent override.
 */

export const OPENAI_MODELS = {
  GPT_4O: "gpt-4o",
} as const;

export const GEMINI_MODELS = {
  FLASH_3_5: "gemini-3.5-flash",
  FLASH_3_PREVIEW: "gemini-3-flash-preview",
  FLASH_2_5: "gemini-2.5-flash",
  PRO_3_1: "gemini-3.1-pro-preview",
} as const;

/**
 * Compatibility aliases for historical imports. They no longer point to an
 * Anthropic provider and exist only so old structured-task call sites stay
 * source-compatible while the adapter routes through Gemini then OpenAI.
 */
export const CLAUDE_MODELS = {
  HAIKU: GEMINI_MODELS.FLASH_3_5,
  SONNET: GEMINI_MODELS.FLASH_3_5,
  OPUS: GEMINI_MODELS.FLASH_3_5,
  OPUS_4_8: GEMINI_MODELS.FLASH_3_5,
  OPUS_4_6: GEMINI_MODELS.FLASH_3_5,
} as const;

export type VapiVoiceProvider = "google" | "openai" | "openrouter";
export type VoiceModelSpeed = "fastest" | "fast" | "balanced" | "heavy";

export interface VapiVoiceModelSelection {
  provider: VapiVoiceProvider;
  model: string;
  fallbackModels?: string[];
  userSelected?: boolean;
}

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

export const VAPI_TENANT_DEFAULT_PROVIDER = "google" as const;
export const VAPI_SHOWCASE_PROVIDER = "google" as const;
export const VAPI_OPENAI_FALLBACK_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_DEFAULT_FALLBACK_MODELS: readonly string[] = [];
export const VAPI_VOICE_FALLBACK_PROVIDER = "openai" as const;
export const VAPI_VOICE_FALLBACK_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_PREMIUM_MODEL = GEMINI_MODELS.FLASH_3_5;
export const VAPI_TENANT_DEFAULT_MODEL = GEMINI_MODELS.FLASH_3_5;
export const VAPI_SHOWCASE_MODEL = GEMINI_MODELS.FLASH_3_5;

export function isOpenRouterModelId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id || id.length > 160 || id.includes("..") || /\s/.test(id)) return false;
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
}

/**
 * Only a valid explicit OpenRouter model overrides Wireline-managed routing.
 * Stale provider values normalize to Gemini rather than reviving a retired
 * runtime path.
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
    provider: VAPI_TENANT_DEFAULT_PROVIDER,
    model: VAPI_TENANT_DEFAULT_MODEL,
    userSelected: false,
  };
}

export const VOICE_MODEL_CATALOG: readonly VoiceModelOption[] = [
  {
    provider: "google",
    model: GEMINI_MODELS.FLASH_3_5,
    label: "Gemini Flash",
    speed: "fastest",
    envKey: "GEMINI_API_KEY",
    note: "Wireline default. Managed calls retry through OpenAI if Gemini is unavailable.",
  },
  {
    provider: "openrouter",
    model: "google/gemini-3.5-flash",
    label: "OpenRouter — choose a model",
    speed: "balanced",
    envKey: "OPENROUTER_API_KEY",
    latencyWarning: true,
    acceptsCustomModelId: true,
    note: "Advanced override. Choose a namespaced OpenRouter model ID for this agent.",
  },
] as const;

export function clampVoiceTemperature(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export type TaskComplexity = "simple" | "medium" | "complex";

export const MODEL_PRICING = {
  [GEMINI_MODELS.FLASH_3_5]: { input: 0.15, output: 1.25, cacheRead: 0, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_2_5]: { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite: 0 },
  [GEMINI_MODELS.PRO_3_1]: { input: 1.25, output: 5, cacheRead: 0, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_4O]: { input: 5, output: 15, cacheRead: 0, cacheWrite: 0 },
} as const;

export function selectModelForTask(_complexity: TaskComplexity): string {
  return GEMINI_MODELS.FLASH_3_5;
}

export const CLAUDE_REASONING_MODEL_DEFAULT: string = GEMINI_MODELS.FLASH_3_5;
export const CLAUDE_DIRECTOR_MODEL: string = GEMINI_MODELS.FLASH_3_5;
export const CLAUDE_PAINTER_MODEL: string = GEMINI_MODELS.FLASH_3_5;
export const CLAUDE_MODEL_DEFAULT: string = CLAUDE_REASONING_MODEL_DEFAULT;
export const DEFAULT_MODEL: string = CLAUDE_REASONING_MODEL_DEFAULT;

export function claudeModelLabel(model: string): string {
  if (model === GEMINI_MODELS.FLASH_3_5) return "Gemini Flash";
  if (model === OPENAI_MODELS.GPT_4O) return "GPT-4o";
  return model;
}

export type AdaptiveEffort = "low" | "medium" | "high";
export function resolveAdaptiveEffort(): AdaptiveEffort {
  const raw = process.env.WIRELINE_DEEP_EFFORT?.trim().toLowerCase();
  return raw === "low" || raw === "medium" || raw === "high" ? raw : "medium";
}
