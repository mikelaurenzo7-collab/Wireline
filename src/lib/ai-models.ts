/**
 * Wireline model policy.
 * Managed runtime: OpenAI primary for structured reasoning and Vapi call
 * intelligence, with Gemini as the first automatic fallback and the Vercel AI
 * Gateway as the governed multi-model continuity route. xAI remains available
 * only through explicit opt-in experiments; it is not part of the launch
 * default provider chain.
 */
export const XAI_MODELS = {
  GROK_4_5: "grok-4.5",
  // grok-4-1-fast-reasoning was retired 2026-05-15; retired slugs silently
  // redirect to grok-4.3 and bill at grok-4.3 rates, so route there explicitly.
  GROK_4_3: "grok-4.3",
} as const;

export const OPENAI_MODELS = {
  GPT_5_6_TERRA: "gpt-5.6-terra",
  GPT_5_6_LUNA: "gpt-5.6-luna",
  GPT_5_6_SOL: "gpt-5.6-sol",
  // gpt-5-2025-08-07 shuts down 2026-12-11 (deprecated 2026-06-11); kept only
  // to price historical audit rows until the shutdown completes.
  GPT_5: "gpt-5",
  GPT_4O: "gpt-4o",
} as const;

export const GEMINI_MODELS = {
  FLASH_3_6: "gemini-3.6-flash",
  FLASH_3_5: "gemini-3.5-flash",
  FLASH_3_5_LITE: "gemini-3.5-flash-lite",
  FLASH_3_1_LITE: "gemini-3.1-flash-lite",
  FLASH_2_5: "gemini-2.5-flash",
  PRO_3_1: "gemini-3.1-pro-preview",
} as const;

/** Optional xAI structured model for explicitly enabled experiments. */
export const XAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_XAI_STRUCTURED_MODEL?.trim() || XAI_MODELS.GROK_4_5;
/** Managed structured default through the direct OpenAI Responses API. */
export const OPENAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_OPENAI_STRUCTURED_MODEL?.trim() || OPENAI_MODELS.GPT_5_6_TERRA;
/**
 * First automatic fallback if direct OpenAI is unavailable. Gemini 3.6 Flash
 * (GA 2026-07-21) matches 3.5 Flash input price with 17% cheaper output and
 * fewer output tokens; the Vapi voice fallback stays on 3.5 Flash until 3.6
 * support is verified on Vapi's google provider.
 */
export const GEMINI_STRUCTURED_FALLBACK_MODEL =
  process.env.WIRELINE_GEMINI_STRUCTURED_FALLBACK_MODEL?.trim() || GEMINI_MODELS.FLASH_3_6;

/** The managed structured default the runtime asks for first. */
export const STRUCTURED_PRIMARY_MODEL = OPENAI_STRUCTURED_PRIMARY_MODEL;

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
/**
 * $/1M tokens, verified 2026-08 against the OpenAI, Google, and xAI price
 * pages. None of these vendors charges a cache-write fee, so cacheWrite is 0
 * everywhere; cacheRead is the vendor's cached-input rate. grok-4.5 and
 * gemini-3.1-pro-preview double their rates for prompts >=200k tokens; the
 * stored rates are the standard (<200k) tier.
 */
export const MODEL_PRICING = {
  [XAI_MODELS.GROK_4_5]: { input: 2, output: 6, cacheRead: 0.3, cacheWrite: 0 },
  [XAI_MODELS.GROK_4_3]: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_5_6_TERRA]: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_5_6_LUNA]: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_5_6_SOL]: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_5]: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_4O]: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
  // Realtime ids are priced at their TEXT-token rates so audited realtime
  // turns stop falling back to Terra pricing. Audio tokens (gpt-realtime-2.1
  // $32 in / $64 out; -mini $10 / $20) flow browser-to-vendor over WebRTC and
  // are not yet metered here.
  "gpt-realtime-2.1": { input: 4, output: 24, cacheRead: 0.4, cacheWrite: 0 },
  "gpt-realtime-2.1-mini": { input: 0.6, output: 2.4, cacheRead: 0.06, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_3_6]: { input: 1.5, output: 7.5, cacheRead: 0.15, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_3_5]: { input: 1.5, output: 9, cacheRead: 0.15, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_3_5_LITE]: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_3_1_LITE]: { input: 0.25, output: 1.5, cacheRead: 0.025, cacheWrite: 0 },
  [GEMINI_MODELS.FLASH_2_5]: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
  [GEMINI_MODELS.PRO_3_1]: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
} as const;
export const DEFAULT_MODEL = STRUCTURED_PRIMARY_MODEL;
/**
 * Route structured work by complexity inside the OpenAI primary lane.
 * Gemini remains the automatic continuity fallback (see ai-client), not a
 * complexity selector — OpenAI only accepts gpt-* ids on the primary path.
 * GPT-5.6 Luna ($0.20/$1.20) is the family's cost lane — 6x cheaper on input
 * than the retiring GPT-5 (shutdown 2026-12-11) it replaces here.
 */
export function selectModelForTask(complexity: TaskComplexity): string {
  if (complexity === "simple" || complexity === "medium") return OPENAI_MODELS.GPT_5_6_LUNA;
  return STRUCTURED_PRIMARY_MODEL;
}
export function modelLabel(model: string): string {
  if (model === OPENAI_MODELS.GPT_5_6_TERRA) return "GPT-5.6 Terra";
  if (model === OPENAI_MODELS.GPT_5_6_LUNA) return "GPT-5.6 Luna";
  if (model === OPENAI_MODELS.GPT_5_6_SOL) return "GPT-5.6 Sol";
  if (model === XAI_MODELS.GROK_4_5) return "Grok 4.5";
  if (model === XAI_MODELS.GROK_4_3) return "Grok 4.3";
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
