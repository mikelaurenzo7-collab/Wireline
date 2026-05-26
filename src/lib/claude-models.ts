/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * Claude Model Constants & Tiering
 * ---------------------------------------------------------------------------
 * Centralized model definitions, pricing, and selection logic for all
 * Claude-powered paths in Wireline. Extracted from claude-brain.ts for
 * maintainability.
 *
 * Default model: claude-opus-4-7 (current most-capable; adaptive thinking only).
 *
 * MODEL TIERING (Performance Optimization):
 * - Haiku: Fast, cheap ($1/M tokens) for simple classification, extraction
 * - Sonnet: Balanced ($3/M tokens) for most reasoning tasks
 * - Opus: Deep analysis ($15/M tokens) for complex multi-step reasoning only
 * Using tiering reduces costs 60-80% while maintaining quality.
 */

export const CLAUDE_MODELS = {
  /** Fastest, cheapest. Best for: classification, simple extraction, summaries */
  HAIKU: "claude-haiku-4-5",
  /** Balanced speed/quality. Best for: reasoning, analysis, structured output */
  SONNET: "claude-sonnet-4-6",
  /** Deepest reasoning. Best for: complex analysis, creative writing, research */
  OPUS: "claude-opus-4-7",
} as const;

export const OPENAI_MODELS = {
  GPT_4O: "gpt-4o",
} as const;

export const GEMINI_MODELS = {
  FLASH_3_PREVIEW: "gemini-3-flash-preview",
  FLASH_2_5: "gemini-2.5-flash",
} as const;

export const VAPI_TENANT_DEFAULT_PROVIDER = "google" as const;
export const VAPI_SHOWCASE_PROVIDER = "google" as const;
export const VAPI_OPENAI_FALLBACK_MODEL = OPENAI_MODELS.GPT_4O;
// Vapi rejects cross-provider fallbackModels on Anthropic + Google
// assistants, so this list is only attached to OpenAI payloads we
// construct ourselves.
export const VAPI_DEFAULT_FALLBACK_MODELS = [VAPI_OPENAI_FALLBACK_MODEL] as const;

/**
 * Primary realtime model for the Vapi voice runtime.
 * Gemini 3 Flash Preview — yields ultra-low turn-taking latency
 * (~150-250ms TTFT), ensuring smooth and responsive live conversation
 * flow without awkward delays. Claude Haiku 4.5 is retained as the
 * fallback target for explicit Anthropic voice configurations.
 */
export const VAPI_PREMIUM_MODEL = GEMINI_MODELS.FLASH_3_PREVIEW;

/**
 * Default tenant voice model for deployed phone agents.
 */
export const VAPI_TENANT_DEFAULT_MODEL = GEMINI_MODELS.FLASH_3_PREVIEW;

/**
 * Model used by the Wireline showcase + demo assistants.
 * The public line shares the same Gemini 3 Flash Preview primary runtime
 * as tenant voice agents for consistent, ultra-low latency voice behavior.
 */
export const VAPI_SHOWCASE_MODEL = GEMINI_MODELS.FLASH_3_PREVIEW;

const GEMINI_FLASH_LATEST_ALIASES = new Set([
  GEMINI_MODELS.FLASH_3_PREVIEW,
  "gemini-3-flash",
  "gemini-2.5-flash-latest",
  "gemini-flash-latest",
]);

export interface VapiVoiceModelSelection {
  provider: "anthropic" | "google" | "openai";
  model: string;
  fallbackModels?: string[];
}

export function resolveVapiVoiceModelSelection(input?: {
  provider?: string | null;
  model?: string | null;
}): VapiVoiceModelSelection {
  const requestedProvider = String(input?.provider || "").toLowerCase();
  const requestedModel = String(input?.model || "").trim();
  const requestedModelLower = requestedModel.toLowerCase();
  const anthroVoiceRequested =
    requestedProvider === "anthropic" ||
    requestedModelLower.includes("claude") ||
    requestedModelLower.includes("sonnet") ||
    requestedModelLower.includes("opus") ||
    requestedModelLower.includes("haiku");

  if (anthroVoiceRequested) {
    // Normalize Claude family aliases → a concrete model id Vapi accepts.
    // Sonnet / Opus stay on their requested model when the operator
    // explicitly chose them (e.g. higher-quality long calls). Bare
    // "claude" or "haiku" lands on Haiku 4.5 — our default voice
    // runtime fallback, fast enough for natural turn-taking. Vapi rejects
    // cross-provider fallbackModels on Anthropic assistants, so we
    // omit the OpenAI fallback here. We must use CLAUDE_MODELS.HAIKU
    // as the default normalization target rather than VAPI_TENANT_DEFAULT_MODEL
    // to avoid returning a Google model under the Anthropic provider.
    let normalized: string = CLAUDE_MODELS.HAIKU;
    if (requestedModelLower.includes("sonnet")) normalized = CLAUDE_MODELS.SONNET;
    else if (requestedModelLower.includes("opus")) normalized = CLAUDE_MODELS.OPUS;
    else if (requestedModelLower.includes("haiku") || requestedModelLower.startsWith("claude")) {
      normalized = requestedModel || CLAUDE_MODELS.HAIKU;
    }
    return {
      provider: "anthropic",
      model: normalized,
    };
  }

  if (requestedProvider === "google" || requestedModelLower.includes("gemini")) {
    const normalizedGoogleModel =
      !requestedModel || !requestedModelLower.includes("gemini")
        ? VAPI_TENANT_DEFAULT_MODEL
        : GEMINI_FLASH_LATEST_ALIASES.has(requestedModelLower)
          ? GEMINI_MODELS.FLASH_3_PREVIEW
          : requestedModel;
    return {
      provider: "google",
      model: normalizedGoogleModel,
    };
  }

  if (
    requestedProvider === "openai" ||
    requestedModelLower.startsWith("gpt") ||
    requestedModelLower.startsWith("o1") ||
    requestedModelLower.startsWith("o3") ||
    requestedModelLower.startsWith("o4") ||
    requestedModelLower.startsWith("chatgpt")
  ) {
    const normalizedOpenAiModel =
      requestedModel &&
      (requestedModelLower.startsWith("gpt") ||
        requestedModelLower.startsWith("o1") ||
        requestedModelLower.startsWith("o3") ||
        requestedModelLower.startsWith("o4") ||
        requestedModelLower.startsWith("chatgpt"))
        ? requestedModel
        : VAPI_OPENAI_FALLBACK_MODEL;
    const fallbackModels = [...VAPI_DEFAULT_FALLBACK_MODELS]
      .filter((model) => model !== normalizedOpenAiModel)
      .slice(0, 3);
    return {
      provider: "openai",
      model: normalizedOpenAiModel,
      ...(fallbackModels.length ? { fallbackModels } : {}),
    };
  }

  return {
    provider: VAPI_TENANT_DEFAULT_PROVIDER,
    model: VAPI_TENANT_DEFAULT_MODEL,
  };
}

/** Task complexity tiers for automatic model selection */
export type TaskComplexity = "simple" | "medium" | "complex";

/** Model pricing per 1M tokens (approximate, for cost estimation) */
export const MODEL_PRICING = {
  [CLAUDE_MODELS.HAIKU]: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  [CLAUDE_MODELS.SONNET]: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  [CLAUDE_MODELS.OPUS]: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-6": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3, cacheRead: 0, cacheWrite: 0 },
  "gemini-1.5-pro": { input: 1.25, output: 5, cacheRead: 0, cacheWrite: 0 },
  "gemini-3-flash-preview": { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite: 0 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite: 0 },
  "gpt-4o": { input: 5, output: 15, cacheRead: 0, cacheWrite: 0 },
  "gpt-4-turbo": { input: 10, output: 30, cacheRead: 0, cacheWrite: 0 },
} as const;

/**
 * Select optimal model for task complexity.
 * - simple: Haiku (classification, sentiment, extraction)
 * - medium: Sonnet (analysis, structured output, reasoning)
 * - complex: Opus (deep research, creative writing, multi-step reasoning)
 */
export function selectModelForTask(complexity: TaskComplexity): string {
  switch (complexity) {
    case "simple":
      return CLAUDE_MODELS.HAIKU;
    case "medium":
      return CLAUDE_MODELS.SONNET;
    case "complex":
      return CLAUDE_MODELS.OPUS;
    default:
      return CLAUDE_MODELS.SONNET;
  }
}

/**
 * Canonical Claude model id used by every Claude-powered path in Wireline.
 *
 * Exported so callers (server.ts, /api/health, /api/claude/status, AdminSettings)
 * can reference a single source of truth instead of hard-coding the string.
 *
 * Override with the ANTHROPIC_MODEL env var (e.g. for staging / A-B tests).
 * Verified against `@anthropic-ai/sdk@^0.92`: `"claude-opus-4-7"` is the first
 * entry in the published `Anthropic.Model` union, so this is the
 * highest-capability current-generation default.
 *
 * NOTE: New code should use selectModelForTask() for cost optimization.
 * This default is kept for backward compatibility.
 */
export const CLAUDE_MODEL_DEFAULT: string = process.env.ANTHROPIC_MODEL || CLAUDE_MODELS.OPUS;

/**
 * @deprecated Use CLAUDE_MODEL_DEFAULT or selectModelForTask(). Kept as an
 * exported alias so existing references continue to compile during the rollout.
 */
export const DEFAULT_MODEL = CLAUDE_MODEL_DEFAULT;
