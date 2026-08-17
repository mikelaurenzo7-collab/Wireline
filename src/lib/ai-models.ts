/**
 * Wireline model policy.
 *
 * These are different xAI products and must not be collapsed into one id:
 *
 * - **Structured reasoning** uses the xAI Responses API model `grok-4.6`
 *   (text/image in, text out). That is not a voice model.
 * - **Live PSTN** uses Vapi. Vapi's published xAI *language* models are
 *   `grok-4.3`, `grok-4.20-0309-reasoning`, and `grok-4.20-0309-non-reasoning`.
 *   Grok 4.6 is not in that catalog. Live *voice* is a separate Vapi field:
 *   `voice.provider: "xai"` with Eve/Ara/Rex/Sal/Leo.
 * - **Studio browser tests** use Vapi web with the same `grok-4.3` language
 *   model as PSTN. OpenAI Realtime is backup and ChatGPT-widget simulation.
 * - **Imagine** image and video models exist at xAI. Wireline does not
 *   generate those files: they include a Grok watermark that cannot be
 *   turned off. That is not Grok Bot, not live PSTN, and not a priced
 *   runtime model in this catalog.
 *
 * OpenAI is the first automatic structured continuity lane, then Gemini, then
 * the Vercel AI Gateway. `reasoning-provider-policy.ts` owns eligibility and
 * ordering.
 */
export const XAI_MODELS = {
  GROK_4_6: "grok-4.6",
  GROK_4_5: "grok-4.5",
  // Vapi's documented live-call xAI language model (non-reasoning).
  GROK_4_3: "grok-4.3",
} as const;

export const OPENAI_MODELS = {
  GPT_5_6_TERRA: "gpt-5.6-terra",
  GPT_5_6_LUNA: "gpt-5.6-luna",
  GPT_5_6_SOL: "gpt-5.6-sol",
  // Historical audit rows still use this id. New work routes through the
  // current GPT-5.6 family below.
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

/** Managed structured default through the direct xAI Responses API. */
export const XAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_XAI_STRUCTURED_MODEL?.trim() || XAI_MODELS.GROK_4_6;
/** First automatic continuity lane through the direct OpenAI Responses API. */
export const OPENAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_OPENAI_STRUCTURED_MODEL?.trim() || OPENAI_MODELS.GPT_5_6_TERRA;
/** Continuity fallback if direct OpenAI is unavailable. */
export const GEMINI_STRUCTURED_FALLBACK_MODEL =
  process.env.WIRELINE_GEMINI_STRUCTURED_FALLBACK_MODEL?.trim() || GEMINI_MODELS.FLASH_3_6;

/** The managed structured default the runtime asks for first. */
export const STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL;

export type VapiVoiceProvider = "xai" | "google" | "openai";
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

export const VAPI_TENANT_DEFAULT_PROVIDER = "xai" as const;
export const VAPI_SHOWCASE_PROVIDER = "xai" as const;
/** Vapi's published xAI live-call language model. Not Grok 4.6. */
export const VAPI_TENANT_DEFAULT_MODEL = XAI_MODELS.GROK_4_3;
export const VAPI_SHOWCASE_MODEL = XAI_MODELS.GROK_4_3;
export const VAPI_PREMIUM_MODEL = XAI_MODELS.GROK_4_3;
/**
 * Same-provider Grok id from Vapi's published xAI catalog.
 * Do not send this as `model.fallbackModels` on `provider: "xai"` — Vapi's
 * XaiModel DTO rejects the property. Continuity is application retry to OpenAI.
 */
export const VAPI_XAI_FALLBACK_MODEL = "grok-4.20-0309-non-reasoning";
/** Same-provider fallback accepted by Vapi's OpenAI model schema. */
export const VAPI_OPENAI_FALLBACK_MODEL = OPENAI_MODELS.GPT_5_6_LUNA;
/** Cross-provider retry is performed by Wireline after a rejected xAI or Gemini request. */
export const VAPI_VOICE_FALLBACK_PROVIDER = "openai" as const;
export const VAPI_VOICE_FALLBACK_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_DEFAULT_FALLBACK_MODELS: readonly string[] = [];

export function isOpenAIModelId(value: unknown): value is string {
  return typeof value === "string" && /^gpt-[a-z0-9._-]+$/i.test(value.trim());
}

export function isXAIModelId(value: unknown): value is string {
  return typeof value === "string" && /grok/i.test(value.trim());
}

export function isGeminiModelId(value: unknown): value is string {
  return typeof value === "string" && value.trim().toLowerCase().includes("gemini");
}

/**
 * Cross-provider call creation is non-idempotent, so fallback is allowed only
 * when Vapi definitively rejected the selected model/provider before dialing.
 * Do not treat unrelated 400s, throttles, or provider 5xx responses as safe.
 */
export function isDefinitiveVapiVoiceModelRejection(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const detail = body.toLowerCase();
  const directRejection =
    /\b(?:invalid|unsupported|unknown|unrecognized)\s+(?:voice\s+)?(?:model|provider)\b/i;
  const namedRejection =
    /\b(?:model|provider)\b[^\r\n.!?]{0,64}\b(?:is\s+)?(?:invalid|unsupported|not\s+supported|not\s+found|unknown|unrecognized|does\s+not\s+exist|must\s+be\s+one\s+of)\b/i;
  return directRejection.test(detail) || namedRejection.test(detail);
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
      // Vapi requires fallbackModels to belong to the selected provider. The
      // existing application-level retry in vapi-client handles Google → OpenAI
      // after a rejected request, so do not encode a cross-provider fallback in
      // the provider payload.
      userSelected: true,
    };
  if ((provider === "xai" || provider === "") && isXAIModelId(model))
    return {
      provider: "xai",
      model,
      userSelected: provider === "xai",
    };
  if (provider === "openai" && isOpenAIModelId(model))
    return {
      provider: "openai",
      model,
      fallbackModels:
        model === VAPI_OPENAI_FALLBACK_MODEL ? undefined : [VAPI_OPENAI_FALLBACK_MODEL],
      userSelected: false,
    };
  return {
    provider: VAPI_TENANT_DEFAULT_PROVIDER,
    model: VAPI_TENANT_DEFAULT_MODEL,
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
    provider: "xai",
    model: XAI_MODELS.GROK_4_3,
    label: "Grok 4.3",
    speed: "fast",
    envKey: "XAI_API_KEY",
    note: "Vapi live-call default. Vapi's XaiModel DTO does not accept fallbackModels; OpenAI retries at the application layer. Structured work uses Grok 4.6 on the xAI API, not this id.",
  },
  {
    provider: "openai",
    model: OPENAI_MODELS.GPT_4O,
    label: "OpenAI GPT-4o",
    speed: "fast",
    envKey: "OPENAI_API_KEY",
    note: "Continuity lane and Studio Realtime. Vapi retries through a same-provider OpenAI fallback.",
  },
  {
    provider: "google",
    model: GEMINI_MODELS.FLASH_3_5,
    label: "Gemini Flash",
    speed: "fastest",
    envKey: "GEMINI_API_KEY",
    note: "Native alternative. A rejected Gemini request is retried by Wireline through OpenAI.",
  },
] as const;

export function clampVoiceTemperature(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export type TaskComplexity = "simple" | "medium" | "complex";
export interface ModelPricingRow {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Standard synchronous API rates in USD per 1M text tokens, verified 2026-08-10.
 * GPT-5.6 cache writes are billed at 1.25x the uncached input rate.
 */
export const MODEL_PRICING = {
  [XAI_MODELS.GROK_4_6]: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
  [XAI_MODELS.GROK_4_5]: { input: 2, output: 6, cacheRead: 0.3, cacheWrite: 0 },
  [XAI_MODELS.GROK_4_3]: {
    input: 1.25,
    output: 2.5,
    cacheRead: 0.2,
    cacheWrite: 0,
  },
  [OPENAI_MODELS.GPT_5_6_TERRA]: {
    input: 2.5,
    output: 15,
    cacheRead: 0.25,
    cacheWrite: 3.125,
  },
  [OPENAI_MODELS.GPT_5_6_LUNA]: {
    input: 1,
    output: 6,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  [OPENAI_MODELS.GPT_5_6_SOL]: {
    input: 5,
    output: 30,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  [OPENAI_MODELS.GPT_5]: {
    input: 1.25,
    output: 10,
    cacheRead: 0.125,
    cacheWrite: 0,
  },
  [OPENAI_MODELS.GPT_4O]: {
    input: 2.5,
    output: 10,
    cacheRead: 1.25,
    cacheWrite: 0,
  },
  // Realtime rows price text tokens. Browser-to-vendor WebRTC audio tokens
  // are not emitted through this structured-runtime audit path.
  "gpt-realtime-2.1": { input: 4, output: 24, cacheRead: 0.4, cacheWrite: 0 },
  "gpt-realtime-2.1-mini": {
    input: 0.6,
    output: 2.4,
    cacheRead: 0.06,
    cacheWrite: 0,
  },
  [GEMINI_MODELS.FLASH_3_6]: {
    input: 1.5,
    output: 7.5,
    cacheRead: 0.15,
    cacheWrite: 0,
  },
  [GEMINI_MODELS.FLASH_3_5]: {
    input: 1.5,
    output: 9,
    cacheRead: 0.15,
    cacheWrite: 0,
  },
  [GEMINI_MODELS.FLASH_3_5_LITE]: {
    input: 0.3,
    output: 2.5,
    cacheRead: 0.03,
    cacheWrite: 0,
  },
  [GEMINI_MODELS.FLASH_3_1_LITE]: {
    input: 0.25,
    output: 1.5,
    cacheRead: 0.025,
    cacheWrite: 0,
  },
  [GEMINI_MODELS.FLASH_2_5]: {
    input: 0.3,
    output: 2.5,
    cacheRead: 0.03,
    cacheWrite: 0,
  },
  [GEMINI_MODELS.PRO_3_1]: {
    input: 2,
    output: 12,
    cacheRead: 0.2,
    cacheWrite: 0,
  },
} as const satisfies Record<string, ModelPricingRow>;

type LongContextRule = {
  thresholdTokens: number;
  inclusive: boolean;
  rates: ModelPricingRow;
};

/** Vendor long-context tiers. The higher rate applies to the full request. */
const MODEL_LONG_CONTEXT_PRICING: Partial<Record<keyof typeof MODEL_PRICING, LongContextRule>> = {
  [OPENAI_MODELS.GPT_5_6_TERRA]: {
    thresholdTokens: 272_000,
    inclusive: false,
    rates: { input: 5, output: 22.5, cacheRead: 0.5, cacheWrite: 6.25 },
  },
  [OPENAI_MODELS.GPT_5_6_LUNA]: {
    thresholdTokens: 272_000,
    inclusive: false,
    rates: { input: 2, output: 9, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  [OPENAI_MODELS.GPT_5_6_SOL]: {
    thresholdTokens: 272_000,
    inclusive: false,
    rates: { input: 10, output: 45, cacheRead: 1, cacheWrite: 12.5 },
  },
  [XAI_MODELS.GROK_4_6]: {
    thresholdTokens: 200_000,
    inclusive: true,
    rates: { input: 4, output: 12, cacheRead: 1, cacheWrite: 0 },
  },
  [XAI_MODELS.GROK_4_5]: {
    thresholdTokens: 200_000,
    inclusive: true,
    rates: { input: 4, output: 12, cacheRead: 0.6, cacheWrite: 0 },
  },
  [XAI_MODELS.GROK_4_3]: {
    thresholdTokens: 200_000,
    inclusive: true,
    rates: { input: 2.5, output: 5, cacheRead: 0.4, cacheWrite: 0 },
  },
  [GEMINI_MODELS.PRO_3_1]: {
    thresholdTokens: 200_000,
    inclusive: false,
    rates: { input: 4, output: 18, cacheRead: 0.4, cacheWrite: 0 },
  },
};

export function bareModelId(model: string): string {
  return model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
}

/** Price the served model and its full prompt size, including cache reads/writes. */
export function pricingForModel(model: string, totalInputTokens = 0): ModelPricingRow {
  const bare = bareModelId(model);
  const key = bare as keyof typeof MODEL_PRICING;
  const standard = MODEL_PRICING[key] ?? MODEL_PRICING[OPENAI_MODELS.GPT_5_6_TERRA];
  const long = MODEL_LONG_CONTEXT_PRICING[key];
  if (!long) return standard;
  const crossed = long.inclusive
    ? totalInputTokens >= long.thresholdTokens
    : totalInputTokens > long.thresholdTokens;
  return crossed ? long.rates : standard;
}
export const DEFAULT_MODEL = STRUCTURED_PRIMARY_MODEL;
/**
 * Route structured work by complexity inside the OpenAI continuity lane.
 * The xAI primary remaps non-Grok ids onto Grok 4.6 in `callXAI`. Gemini
 * remains an automatic continuity fallback (see ai-client), not a complexity
 * selector. The OpenAI ladder follows workload guidance: Luna for efficient
 * high-volume work, Terra for balanced work, and Sol for complex professional
 * work.
 */
export function selectModelForTask(complexity: TaskComplexity): string {
  if (complexity === "simple") return OPENAI_MODELS.GPT_5_6_LUNA;
  if (complexity === "medium") return OPENAI_MODELS.GPT_5_6_TERRA;
  return OPENAI_MODELS.GPT_5_6_SOL;
}
export function modelLabel(model: string): string {
  if (model === OPENAI_MODELS.GPT_5_6_TERRA) return "GPT-5.6 Terra";
  if (model === OPENAI_MODELS.GPT_5_6_LUNA) return "GPT-5.6 Luna";
  if (model === OPENAI_MODELS.GPT_5_6_SOL) return "GPT-5.6 Sol";
  if (model === XAI_MODELS.GROK_4_6) return "Grok 4.6";
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
