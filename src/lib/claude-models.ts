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
  /** GA release, May 19 2026. Replaces gemini-3-flash-preview. */
  FLASH_3_5: "gemini-3.5-flash",
  /** Legacy — kept for operators who pinned this model explicitly. */
  FLASH_3_PREVIEW: "gemini-3-flash-preview",
  FLASH_2_5: "gemini-2.5-flash",
} as const;

export const VAPI_TENANT_DEFAULT_PROVIDER = "anthropic" as const;
export const VAPI_SHOWCASE_PROVIDER = "anthropic" as const;
export const VAPI_OPENAI_FALLBACK_MODEL = OPENAI_MODELS.GPT_4O;
// Vapi rejects cross-provider fallbackModels on Anthropic + Google
// assistants, so this list is only attached to OpenAI payloads we
// construct ourselves.
export const VAPI_DEFAULT_FALLBACK_MODELS = [VAPI_OPENAI_FALLBACK_MODEL] as const;

/**
 * Application-level voice fallback model. When the primary Anthropic
 * model is unavailable or times out, the retry path uses Gemini Flash
 * as a fast backup. This is NOT a Vapi fallbackModels entry (Vapi
 * rejects cross-provider fallbacks on Anthropic assistants) — it's
 * used by our own retry logic in vapi-client.ts.
 */
export const VAPI_VOICE_FALLBACK_PROVIDER = "google" as const;
export const VAPI_VOICE_FALLBACK_MODEL = GEMINI_MODELS.FLASH_3_5;

/**
 * Primary realtime model for the Vapi voice runtime.
 * Claude Opus 4.6 — the smartest, most adaptive voice model available.
 * Yields natural, consistent cadence and tone throughout the entire call
 * without the token-burst irregularity that plagues streaming-optimized
 * models like Gemini Flash. Higher cost per token but eliminates the
 * perceptible speed/cadence shifts that kill caller trust on demo calls.
 *
 * Gemini 3.5 Flash is retained as the application-level fallback
 * (VAPI_VOICE_FALLBACK_MODEL) for availability failures.
 */
export const VAPI_PREMIUM_MODEL = CLAUDE_MODELS.OPUS;

/**
 * Default tenant voice model for deployed phone agents.
 * Claude Opus 4.6 — consistent output token pacing eliminates the
 * mid-call cadence doubling caused by Gemini's variable burst sizes.
 */
export const VAPI_TENANT_DEFAULT_MODEL = "claude-opus-4-6";

/**
 * Model used by the Wireline showcase + demo assistants.
 * Same Opus 4.6 as tenant agents — the demo line must be the best
 * possible experience since it's the product's first impression.
 */
export const VAPI_SHOWCASE_MODEL = "claude-opus-4-6";

const GEMINI_FLASH_LATEST_ALIASES = new Set([
  GEMINI_MODELS.FLASH_3_5,
  GEMINI_MODELS.FLASH_3_PREVIEW,
  "gemini-3.5-flash",
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
    // Default normalization target is now claude-opus-4-6 — the voice
    // runtime default. Operators who explicitly select Sonnet/Haiku get
    // what they asked for; bare "claude" or unspecified lands on Opus 4.6
    // for maximum voice quality and consistent cadence.
    // Vapi rejects cross-provider fallbackModels on Anthropic assistants,
    // so we omit any fallback here.
    let normalized: string = "claude-opus-4-6";
    if (requestedModelLower.includes("sonnet")) normalized = CLAUDE_MODELS.SONNET;
    else if (requestedModelLower.includes("opus")) {
      // Prefer the exact requested model string if it includes "opus"
      normalized = requestedModel || "claude-opus-4-6";
    } else if (requestedModelLower.includes("haiku")) {
      normalized = CLAUDE_MODELS.HAIKU;
    } else if (requestedModelLower.startsWith("claude")) {
      normalized = requestedModel || "claude-opus-4-6";
    }
    return {
      provider: "anthropic",
      model: normalized,
    };
  }

  if (requestedProvider === "google" || requestedModelLower.includes("gemini")) {
    const normalizedGoogleModel =
      !requestedModel || !requestedModelLower.includes("gemini")
        ? GEMINI_MODELS.FLASH_3_5
        : GEMINI_FLASH_LATEST_ALIASES.has(requestedModelLower)
          ? GEMINI_MODELS.FLASH_3_5
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
  "gemini-3.5-flash": { input: 0.15, output: 1.25, cacheRead: 0, cacheWrite: 0 },
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WIRELINE LLM TIERING ARCHITECTURE (Single Source of Truth)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Wireline uses a quality-first LLM system optimized for the
 * voice-first agent use case. Consistency and intelligence over speed:
 *
 *   • Voice Runtime  → Claude Opus 4.6   (consistent cadence + smartest adaptive voice)
 *   • Voice Fallback → Gemini 3.5 Flash  (speed backup for availability failures)
 *   • Reasoning Layer → Claude Opus 4.7  (adaptive depth + tool reliability)
 *
 * RATIONALE
 *
 * Voice calls demand CONSISTENT cadence above all else. Gemini Flash's
 * variable token burst rates caused perceptible speed doubling mid-call
 * — the agent's speaking pace would suddenly accelerate on dense content
 * (pricing, confirmations, technical details) then slow back down on
 * conversational turns. This reads as "AI" to callers and kills trust.
 *
 * Claude Opus 4.6 delivers even, measured output token pacing that
 * the TTS engine renders as one consistent voice throughout the call.
 * The ~200-400ms latency increase vs Flash is acceptable given the
 * dramatic improvement in perceived naturalness.
 *
 * Gemini 3.5 Flash remains as the application-level fallback for when
 * Anthropic is unavailable — speed over quality is the right tradeoff
 * only when the alternative is a failed call.
 *
 * TIER MAP
 *
 *   Voice Runtime        : Claude Opus 4.6   (VAPI_TENANT_DEFAULT_MODEL)
 *   Voice Fallback       : Gemini 3.5 Flash  (VAPI_VOICE_FALLBACK_MODEL)
 *   Reasoning (default)  : Claude Opus 4.7   (CLAUDE_MODEL_DEFAULT)
 *   Reasoning (simple)   : Claude Haiku 4.5  (selectModelForTask("simple"))
 *   Grounded Search      : Gemini 2.5 Flash  (native googleSearchRetrieval)
 *
 * FILES THAT ENFORCE THIS
 *
 *   src/lib/claude-models.ts          — constants and resolveVapiVoiceModelSelection
 *   src/lib/vapi-assistant-factory.ts — reads voiceLlmProvider/Model from settings
 *   src/lib/vapi-client.ts            — same, for outbound
 *   src/lib/claude-recipes.ts         — brief, coach, postCallAnalysis, dailyBrief
 *   src/routes/health-routes.ts       — exposes tiering to /api/health
 *
 * COST MODEL (approximate, May 2026)
 *
 *   Voice (Opus 4.6)      : $15–75 per 1M tokens   — premium quality, worth it for demo
 *   Voice Fallback (Flash) : $0.15–1.25 per 1M tokens — used only on Anthropic outage
 *   Reasoning (Opus 4.7)  : $15–75 per 1M tokens   — high-value, low-volume
 *
 * When Grok-4 is available and benchmarked, this comment block will be
 * updated. Until then, the tiering above is the production contract.
 */
