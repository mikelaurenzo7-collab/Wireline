/**
 * BotBound model policy.
 *
 * Structured reasoning uses xAI first, then OpenAI, then the legacy AI Gateway
 * when configured. Gemini is retired; its ids and rates remain only to price
 * historical audit rows. Twilio is the carrier, number, and SMS provider.
 */
export const XAI_MODELS = {
  GROK_4_7: "grok-4.7",
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

/** Anthropic model ids retained for other Claude-backed features. */
export const ANTHROPIC_MODELS = {
  OPUS_5_5: "claude-opus-5-5",
  OPUS_5: "claude-opus-5",
  SONNET_5_5: "claude-sonnet-5-5",
} as const;

/**
 * Not selectable, but server-side refusal fallback can serve a turn on them
 * (Opus 5.5 falls back to Opus 5 or Opus 4.8; Sonnet 5.5 to Sonnet 5), so
 * their usage must be priced at their own rates.
 */
export const ANTHROPIC_FALLBACK_MODELS = {
  OPUS_4_8: "claude-opus-4-8",
  SONNET_5: "claude-sonnet-5",
} as const;

export const GEMINI_MODELS = {
  FLASH_3_6: "gemini-3.6-flash",
  FLASH_3_5: "gemini-3.5-flash",
  FLASH_3_5_LITE: "gemini-3.5-flash-lite",
  FLASH_3_1_LITE: "gemini-3.1-flash-lite",
  FLASH_2_5: "gemini-2.5-flash",
  PRO_3_1: "gemini-3.1-pro-preview",
} as const;

/** Managed structured primary through the direct xAI Responses API. */
export const XAI_STRUCTURED_PRIMARY_MODEL = /^grok-[a-z0-9._-]+$/i.test(
  process.env.WIRELINE_XAI_STRUCTURED_MODEL?.trim() || "",
)
  ? process.env.WIRELINE_XAI_STRUCTURED_MODEL!.trim()
  : XAI_MODELS.GROK_4_7;
/** Structured backup through the direct OpenAI Responses API. */
export const OPENAI_STRUCTURED_PRIMARY_MODEL =
  process.env.WIRELINE_OPENAI_STRUCTURED_MODEL?.trim() || OPENAI_MODELS.GPT_5_6_TERRA;

/** The managed structured default the runtime asks for first. */
export const STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL;

export const LIVE_VOICE_PROVIDER = "openai" as const;
export const LIVE_VOICE_MODEL = "gpt-realtime-2.1" as const;

export function isXAIModelId(value: unknown): value is string {
  return typeof value === "string" && /^grok-[a-z0-9._-]+$/i.test(value.trim());
}

export function isOpenAIModelId(value: unknown): value is string {
  return typeof value === "string" && /^gpt-[a-z0-9._-]+$/i.test(value.trim());
}

export function isGeminiModelId(value: unknown): value is string {
  return typeof value === "string" && value.trim().toLowerCase().includes("gemini");
}

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
 * Current synchronous API rates in USD per 1M text tokens, verified
 * 2026-08-31 against vendor-owned model documentation. GPT-5.6 cache writes
 * are billed at 1.25x uncached input. Sol is promotional pricing advertised
 * through at least 2026-11-21 and must be revalidated before that boundary.
 */
export const OPENAI_TEXT_PRICING_EFFECTIVE_DATE = "2026-07-30" as const;
export const OPENAI_SOL_PROMOTIONAL_PRICING_REVIEW_DATE = "2026-11-21" as const;

export const MODEL_PRICING = {
  // xAI first-party rates, verified 2026-10-19 (docs.x.ai models). xAI does not
  // bill cache writes separately.
  [XAI_MODELS.GROK_4_7]: { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
  [XAI_MODELS.GROK_4_3]: { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  [OPENAI_MODELS.GPT_5_6_TERRA]: {
    input: 2,
    output: 12,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
  [OPENAI_MODELS.GPT_5_6_LUNA]: {
    input: 0.2,
    output: 1.2,
    cacheRead: 0.02,
    cacheWrite: 0.25,
  },
  [OPENAI_MODELS.GPT_5_6_SOL]: {
    input: 4,
    output: 20,
    cacheRead: 0.4,
    cacheWrite: 5,
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
  // Anthropic first-party rates, verified 2026-09-25. Cache writes use the
  // five-minute TTL premium (1.25x input).
  [ANTHROPIC_MODELS.OPUS_5_5]: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  [ANTHROPIC_MODELS.OPUS_5]: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  [ANTHROPIC_MODELS.SONNET_5_5]: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  [ANTHROPIC_FALLBACK_MODELS.OPUS_4_8]: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  [ANTHROPIC_FALLBACK_MODELS.SONNET_5]: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
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
export const MODEL_LONG_CONTEXT_PRICING: Partial<
  Record<keyof typeof MODEL_PRICING, LongContextRule>
> = {
  // xAI's higher tier applies to the whole request at or above 200k prompt tokens.
  [XAI_MODELS.GROK_4_7]: {
    thresholdTokens: 200_000,
    inclusive: true,
    rates: { input: 4, output: 12, cacheRead: 1, cacheWrite: 0 },
  },
  [XAI_MODELS.GROK_4_3]: {
    thresholdTokens: 200_000,
    inclusive: true,
    rates: { input: 2.5, output: 5, cacheRead: 0.4, cacheWrite: 0 },
  },
  [OPENAI_MODELS.GPT_5_6_TERRA]: {
    thresholdTokens: 272_000,
    inclusive: false,
    rates: { input: 4, output: 18, cacheRead: 0.4, cacheWrite: 5 },
  },
  [OPENAI_MODELS.GPT_5_6_LUNA]: {
    thresholdTokens: 272_000,
    inclusive: false,
    rates: { input: 0.4, output: 1.8, cacheRead: 0.04, cacheWrite: 0.5 },
  },
  [OPENAI_MODELS.GPT_5_6_SOL]: {
    thresholdTokens: 272_000,
    inclusive: false,
    rates: { input: 8, output: 30, cacheRead: 0.8, cacheWrite: 10 },
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
  // An unlisted Claude model (for example a new fallback target) is priced at
  // the most expensive Claude row, never under-charged at GPT rates.
  const fallbackRow = bare.startsWith("claude-")
    ? MODEL_PRICING[ANTHROPIC_FALLBACK_MODELS.OPUS_4_8]
    : MODEL_PRICING[OPENAI_MODELS.GPT_5_6_TERRA];
  const standard = MODEL_PRICING[key] ?? fallbackRow;
  const long = MODEL_LONG_CONTEXT_PRICING[key];
  if (!long) return standard;
  const crossed = long.inclusive
    ? totalInputTokens >= long.thresholdTokens
    : totalInputTokens > long.thresholdTokens;
  return crossed ? long.rates : standard;
}
export const DEFAULT_MODEL = STRUCTURED_PRIMARY_MODEL;
/**
 * Complexity remains product metadata for prompts and budgets. Every workload
 * starts with the governed structured default; provider continuity is applied
 * by `reasoning-provider-policy.ts`.
 */
export function selectModelForTask(_complexity: TaskComplexity): string {
  return STRUCTURED_PRIMARY_MODEL;
}

export function modelLabel(model: string): string {
  if (/^grok-/i.test(model.trim())) return "BotBound Standard";
  if (model === OPENAI_MODELS.GPT_5_6_TERRA) return "GPT-5.6 Terra";
  if (model === OPENAI_MODELS.GPT_5_6_LUNA) return "GPT-5.6 Luna";
  if (model === OPENAI_MODELS.GPT_5_6_SOL) return "GPT-5.6 Sol";
  if (model === OPENAI_MODELS.GPT_5) return "GPT-5";
  if (model === OPENAI_MODELS.GPT_4O) return "GPT-4o";
  if (model.toLowerCase().includes("gemini")) return "BotBound Legacy";
  return model;
}
export type AdaptiveEffort = "low" | "medium" | "high";
export function resolveAdaptiveEffort(): AdaptiveEffort {
  const value = process.env.WIRELINE_DEEP_EFFORT?.trim().toLowerCase();
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}
