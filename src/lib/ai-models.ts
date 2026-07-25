/**
 * Wireline model policy.
 * Managed runtime: xAI Grok 4.5 primary for structured reasoning, with direct
 * OpenAI as the first automatic fallback, Gemini as the second, and the Vercel
 * AI Gateway as the governed multi-model continuity route. OpenAI GPT-4o
 * remains the managed Vapi call model — the voice path is a separate axis and
 * does not follow the structured default.
 */
export const XAI_MODELS = {
  GROK_4_5: "grok-4.5",
  GROK_4_1_FAST_REASONING: "grok-4.1-fast-reasoning",
} as const;

export const OPENAI_MODELS = {
  GPT_5_6_TERRA: "gpt-5.6-terra",
  GPT_5: "gpt-5",
  GPT_4O: "gpt-4o",
} as const;

export const GEMINI_MODELS = {
  FLASH_3_5: "gemini-3.5-flash",
  FLASH_3_1_LITE: "gemini-3.1-flash-lite",
  FLASH_3_PREVIEW: "gemini-3-flash-preview",
  FLASH_2_5: "gemini-2.5-flash",
  PRO_3_1: "gemini-3.1-pro-preview",
} as const;

/** Managed structured default through the direct xAI Responses API. */
export const XAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_XAI_STRUCTURED_MODEL?.trim() || XAI_MODELS.GROK_4_5;
/** First automatic fallback lane through the direct OpenAI Responses API. */
export const OPENAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_OPENAI_STRUCTURED_MODEL?.trim() || OPENAI_MODELS.GPT_5_6_TERRA;
/** Second automatic fallback if xAI and direct OpenAI are unavailable. */
export const GEMINI_STRUCTURED_FALLBACK_MODEL =
  process.env.WIRELINE_GEMINI_STRUCTURED_FALLBACK_MODEL?.trim() || GEMINI_MODELS.FLASH_3_5;

/** The managed structured default the runtime asks for first. */
export const STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL;

export type VapiVoiceProvider = "google" | "openai";
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

export const VAPI_TENANT_DEFAULT_PROVIDER = "openai" as const;
export const VAPI_SHOWCASE_PROVIDER = "openai" as const;
export const VAPI_TENANT_DEFAULT_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_SHOWCASE_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_PREMIUM_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_OPENAI_FALLBACK_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_VOICE_FALLBACK_PROVIDER = "google" as const;
export const VAPI_VOICE_FALLBACK_MODEL = GEMINI_MODELS.FLASH_3_5;
export const VAPI_DEFAULT_FALLBACK_MODELS: readonly string[] = [VAPI_VOICE_FALLBACK_MODEL];

export function isOpenAIModelId(value: unknown): value is string {
  return typeof value === "string" && /^gpt-[a-z0-9._-]+$/i.test(value.trim());
}

export function isXAIModelId(value: unknown): value is string {
  return typeof value === "string" && /grok/i.test(value.trim());
}

export function isGeminiModelId(value: unknown): value is string {
  return typeof value === "string" && value.trim().toLowerCase().includes("gemini");
}

export function resolveVapiVoiceModelSelection(input?: {
  provider?: string | null;
  model?: string | null;
}): VapiVoiceModelSelection {
  const provider = String(input?.provider || "")
    .trim()
    .toLowerCase();
  const model = String(input?.model || "").trim();
  if (provider === "google" && isGeminiModelId(model))
    return {
      provider: "google",
      model,
      fallbackModels: [VAPI_TENANT_DEFAULT_MODEL],
      userSelected: true,
    };
  if (provider === "openai" && isOpenAIModelId(model))
    return {
      provider: "openai",
      model,
      fallbackModels: [...VAPI_DEFAULT_FALLBACK_MODELS],
      userSelected: false,
    };
  return {
    provider: VAPI_TENANT_DEFAULT_PROVIDER,
    model: VAPI_TENANT_DEFAULT_MODEL,
    fallbackModels: [...VAPI_DEFAULT_FALLBACK_MODELS],
    userSelected: false,
  };
}

/**
 * Resolve the voice brain as a COHERENT (provider, model) pair.
 *
 * `llmProvider`/`llmModel` (agent) and `voiceLlmProvider`/`voiceLlmModel`
 * (tenant) are independently-nullable columns. Resolving provider and model
 * through separate `||` chains can cross sources — e.g. an agent that set only
 * `llmProvider="openai"` combined with a tenant `voiceLlmModel="gemini-…"`
 * yields the incoherent pair openai+gemini, which `resolveVapiVoiceModelSelection`
 * then collapses to the default gpt-4o, silently discarding the tenant's chosen
 * Gemini model. Only a COMPLETE pair (both fields set) is used, agent first,
 * tenant second, else the managed default.
 */
export function resolveCoherentVoiceModel(
  agent: { llmProvider?: string | null; llmModel?: string | null } | null | undefined,
  tenant: { voiceLlmProvider?: string | null; voiceLlmModel?: string | null } | null | undefined,
): VapiVoiceModelSelection {
  const agentPair =
    agent?.llmProvider && agent?.llmModel
      ? { provider: agent.llmProvider, model: agent.llmModel }
      : null;
  const tenantPair =
    tenant?.voiceLlmProvider && tenant?.voiceLlmModel
      ? { provider: tenant.voiceLlmProvider, model: tenant.voiceLlmModel }
      : null;
  return resolveVapiVoiceModelSelection(agentPair || tenantPair || undefined);
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
] as const;

export function clampVoiceTemperature(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export type TaskComplexity = "simple" | "medium" | "complex";
export const MODEL_PRICING = {
  [XAI_MODELS.GROK_4_5]: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
  [XAI_MODELS.GROK_4_1_FAST_REASONING]: { input: 0.2, output: 0.5, cacheRead: 0.05, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_5_6_TERRA]: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 3.125 },
  [OPENAI_MODELS.GPT_5]: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.5625 },
  [OPENAI_MODELS.GPT_4O]: { input: 5, output: 15, cacheRead: 0, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_3_5]: { input: 1.5, output: 9, cacheRead: 0.15, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_3_1_LITE]: { input: 0.25, output: 1.5, cacheRead: 0.025, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_2_5]: { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite: 0 },
  [GEMINI_MODELS.PRO_3_1]: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
} as const;
export const DEFAULT_MODEL = STRUCTURED_PRIMARY_MODEL;
/**
 * Route structured work by complexity inside the xAI primary lane.
 * OpenAI and Gemini remain the automatic continuity fallbacks (see ai-client),
 * not complexity selectors — the xAI path only accepts grok ids and coerces
 * anything else to the structured primary. Grok 4.1 Fast Reasoning is ~1/10
 * the cost of Grok 4.5 for simple/medium tasks.
 */
export function selectModelForTask(complexity: TaskComplexity): string {
  if (complexity === "simple" || complexity === "medium") return XAI_MODELS.GROK_4_1_FAST_REASONING;
  return STRUCTURED_PRIMARY_MODEL;
}
export function modelLabel(model: string): string {
  if (model === OPENAI_MODELS.GPT_5_6_TERRA) return "GPT-5.6 Terra";
  if (model === XAI_MODELS.GROK_4_5) return "Grok 4.5";
  if (model === OPENAI_MODELS.GPT_5) return "GPT-5";
  if (model === OPENAI_MODELS.GPT_4O) return "GPT-4o";
  if (model.toLowerCase().includes("gemini")) return "Gemini";
  if (model.toLowerCase().includes("grok")) return "Grok";
  return model;
}
export type AdaptiveEffort = "low" | "medium" | "high";
export function resolveAdaptiveEffort(): AdaptiveEffort {
  const value = process.env.WIRELINE_DEEP_EFFORT?.trim().toLowerCase();
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}
