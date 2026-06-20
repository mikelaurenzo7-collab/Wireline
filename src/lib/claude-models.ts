/**
 * Runtime model catalog.
 *
 * Managed Wireline voice traffic is OpenAI-first with a native Gemini fallback.
 * OpenRouter remains an explicit per-agent override: a valid provider/model ID
 * is passed through unchanged and is never silently substituted.
 *
 * The historical filename remains only as a source-compatibility bridge while
 * provider-neutral modules are consolidated.
 */

export const OPENAI_MODELS = {
  GPT_5_5: "gpt-5.5",
  GPT_4O: "gpt-4o",
} as const;

export const GEMINI_MODELS = {
  FLASH_3_5: "gemini-3.5-flash",
  FLASH_3_PREVIEW: "gemini-3-flash-preview",
  FLASH_2_5: "gemini-2.5-flash",
  PRO_3_1: "gemini-3.1-pro-preview",
} as const;

/** Managed structured-work order: OpenAI first, Gemini automatic fallback. */
export const OPENAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_OPENAI_STRUCTURED_MODEL?.trim() || OPENAI_MODELS.GPT_5_5;
export const GEMINI_STRUCTURED_FALLBACK_MODEL =
  process.env.WIRELINE_GEMINI_STRUCTURED_FALLBACK_MODEL?.trim() || GEMINI_MODELS.FLASH_3_5;

/**
 * Deprecated aliases retained solely for existing internal imports. They point
 * to OpenAI and never select or initialize Anthropic.
 */
export const CLAUDE_MODELS = {
  HAIKU: OPENAI_STRUCTURED_PRIMARY_MODEL,
  SONNET: OPENAI_STRUCTURED_PRIMARY_MODEL,
  OPUS: OPENAI_STRUCTURED_PRIMARY_MODEL,
  OPUS_4_8: OPENAI_STRUCTURED_PRIMARY_MODEL,
  OPUS_4_6: OPENAI_STRUCTURED_PRIMARY_MODEL,
} as const;

export type VapiVoiceProvider = "google" | "openai" | "openrouter";
export type VoiceModelSpeed = "fastest" | "fast" | "balanced" | "heavy";

export interface VapiVoiceModelSelection {
  provider: VapiVoiceProvider;
  model: string;
  /** Vapi-native model IDs attempted only for Wireline-managed providers. */
  fallbackModels?: string[];
  /** True means the operator deliberately selected an OpenRouter model. */
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

/** Vapi-compatible managed voice defaults. */
export const VAPI_TENANT_DEFAULT_PROVIDER = "openai" as const;
export const VAPI_SHOWCASE_PROVIDER = "openai" as const;
export const VAPI_TENANT_DEFAULT_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_SHOWCASE_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_PREMIUM_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_VOICE_FALLBACK_PROVIDER = "google" as const;
export const VAPI_VOICE_FALLBACK_MODEL = GEMINI_MODELS.FLASH_3_5;
/** The precise native fallback sent with a managed OpenAI call. */
export const VAPI_DEFAULT_FALLBACK_MODELS: readonly string[] = [VAPI_VOICE_FALLBACK_MODEL];

export function isOpenRouterModelId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id || id.length > 160 || id.includes("..") || /\s/.test(id)) return false;
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
}

export function isOpenAIModelId(value: unknown): value is string {
  return typeof value === "string" && /^gpt-[a-z0-9._-]+$/i.test(value.trim());
}

export function isGeminiModelId(value: unknown): value is string {
  return typeof value === "string" && value.trim().toLowerCase().includes("gemini");
}

/**
 * Resolves only supported Vapi-native managed models. A valid OpenRouter model
 * is operator-owned and receives no managed fallback so the caller never sees
 * an unrequested model substitution. Managed OpenAI receives Gemini fallback;
 * an explicit native Gemini selection receives OpenAI fallback.
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

  if (provider === "google" && isGeminiModelId(model)) {
    return {
      provider: "google",
      model,
      fallbackModels: [VAPI_TENANT_DEFAULT_MODEL],
      userSelected: true,
    };
  }

  if (provider === "openai" && isOpenAIModelId(model)) {
    return {
      provider: "openai",
      model,
      fallbackModels: [...VAPI_DEFAULT_FALLBACK_MODELS],
      userSelected: false,
    };
  }

  return {
    provider: VAPI_TENANT_DEFAULT_PROVIDER,
    model: VAPI_TENANT_DEFAULT_MODEL,
    fallbackModels: [...VAPI_DEFAULT_FALLBACK_MODELS],
    userSelected: false,
  };
}

export const VOICE_MODEL_CATALOG: readonly VoiceModelOption[] = [
  {
    provider: "openai",
    model: OPENAI_MODELS.GPT_4O,
    label: "OpenAI GPT-4o",
    speed: "fast",
    envKey: "OPENAI_API_KEY",
    note: "Wireline default. Managed calls retry through Gemini if OpenAI is unavailable.",
  },
  {
    provider: "google",
    model: GEMINI_MODELS.FLASH_3_5,
    label: "Gemini Flash",
    speed: "fastest",
    envKey: "GEMINI_API_KEY",
    note: "Native alternative. If selected directly, calls retry through OpenAI if Gemini is unavailable.",
  },
  {
    provider: "openrouter",
    model: "openai/gpt-4o",
    label: "OpenRouter — choose a model",
    speed: "balanced",
    envKey: "OPENROUTER_API_KEY",
    latencyWarning: true,
    acceptsCustomModelId: true,
    note: "Advanced override. Enter any valid OpenRouter provider/model ID; Wireline sends that exact selection.",
  },
] as const;

export function clampVoiceTemperature(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export type TaskComplexity = "simple" | "medium" | "complex";

/** OpenAI owns managed structured work; Gemini is the failover path. */
export const MODEL_PRICING = {
  [OPENAI_MODELS.GPT_5_5]: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 5 },
  [OPENAI_MODELS.GPT_4O]: { input: 5, output: 15, cacheRead: 0, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_3_5]: { input: 0.15, output: 1.25, cacheRead: 0, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_2_5]: { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite: 0 },
  [GEMINI_MODELS.PRO_3_1]: { input: 1.25, output: 5, cacheRead: 0, cacheWrite: 0 },
} as const;

export function selectModelForTask(_complexity: TaskComplexity): string {
  return OPENAI_STRUCTURED_PRIMARY_MODEL;
}

/** Legacy names retained only for source compatibility. */
export const CLAUDE_REASONING_MODEL_DEFAULT: string = OPENAI_STRUCTURED_PRIMARY_MODEL;
export const CLAUDE_DIRECTOR_MODEL: string = OPENAI_STRUCTURED_PRIMARY_MODEL;
export const CLAUDE_PAINTER_MODEL: string = OPENAI_STRUCTURED_PRIMARY_MODEL;
export const CLAUDE_MODEL_DEFAULT: string = OPENAI_STRUCTURED_PRIMARY_MODEL;
export const DEFAULT_MODEL: string = OPENAI_STRUCTURED_PRIMARY_MODEL;

export function claudeModelLabel(model: string): string {
  if (model === OPENAI_MODELS.GPT_5_5) return "GPT-5.5";
  if (model === OPENAI_MODELS.GPT_4O) return "GPT-4o";
  if (model.toLowerCase().includes("gemini")) return "Gemini";
  return model;
}

export type AdaptiveEffort = "low" | "medium" | "high";
export function resolveAdaptiveEffort(): AdaptiveEffort {
  const raw = process.env.WIRELINE_DEEP_EFFORT?.trim().toLowerCase();
  return raw === "low" || raw === "medium" || raw === "high" ? raw : "medium";
}
