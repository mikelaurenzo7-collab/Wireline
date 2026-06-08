/**
 * Claude Model Constants & Tiering
 * ---------------------------------------------------------------------------
 * Centralized model definitions, pricing, and selection logic for all
 * Claude-powered paths in Wireline. Extracted from claude-brain.ts for
 * maintainability.
 *
 * Default model: claude-opus-4-8 (current most-capable; adaptive thinking only).
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
  OPUS: "claude-opus-4-8",
  /** @deprecated Prior Opus generation — classic design roster reference only */
  OPUS_4_7: "claude-opus-4-7",
  /** Design Studio research, code review, and approval — pinned Opus generation. */
  OPUS_4_6: "claude-opus-4-6",
} as const;

export const OPENAI_MODELS = {
  GPT_4O: "gpt-4o",
} as const;

export const GEMINI_MODELS = {
  /** GA release, May 19 2026. Replaces gemini-3-flash-preview. */
  FLASH_3_5: "gemini-3.5-flash",
  /** Design Studio visual critic — long-context brand review. */
  PRO_3_1: "gemini-3.1-pro-preview",
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
 * Premium / showcase voice model.
 *
 * Claude Sonnet 4.6 is the production voice runtime — the smartest model
 * Anthropic ships in the latency class that voice can tolerate. Real-world
 * TTFT lands in the 300–500 ms range against an 18 KB system prompt, which
 * (combined with Deepgram Nova-3 endpointing @ 40 ms + ElevenLabs Flash
 * v2.5 TTS @ ~200 ms TTFA) puts perceived "agent is thinking" dead air
 * comfortably under 900 ms. Opus 4.7 on the same prompt routinely pushes
 * past 1.5 s, which reads as "did they hang up?" to callers.
 *
 * Sonnet 4.6 is also the model the rest of the market underestimates: it's
 * adaptive, reads tone well, handles tool calls reliably, and stays
 * conversational without the token-burst irregularity that plagues
 * streaming-optimised models like Gemini Flash. Opus 4.7 remains on every
 * non-realtime path (briefs, coaching, post-call analysis) where the
 * latency tax is invisible — that's where its depth pays off.
 */
export const VAPI_PREMIUM_MODEL = CLAUDE_MODELS.SONNET;

/**
 * Default tenant voice model for deployed phone agents.
 * Same Sonnet 4.6 as the showcase — voice quality is the product's first
 * impression and tenant agents get the same engine the demo line uses.
 */
export const VAPI_TENANT_DEFAULT_MODEL: string = CLAUDE_MODELS.SONNET;

/**
 * Model used by the Wireline showcase + demo assistants.
 * Sonnet 4.6 — best-in-class voice intelligence at a TTFT callers don't
 * feel. The Opus 4.7 reasoning layer enriches each call post-hoc.
 */
export const VAPI_SHOWCASE_MODEL: string = CLAUDE_MODELS.SONNET;

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
    //
    // Default normalization target is claude-sonnet-4-6 — the voice
    // runtime default. Sonnet 4.6 is the smartest model in the latency
    // class voice can tolerate (TTFT ~300–500 ms vs Opus's 800–1500 ms
    // on an 18 KB system prompt).
    //
    // Operators who explicitly select Opus/Haiku get what they asked
    // for; bare "claude" or unspecified lands on Sonnet 4.6 for the
    // smart-but-snappy voice profile every Wireline agent ships with.
    //
    // Vapi rejects cross-provider fallbackModels on Anthropic
    // assistants, so we omit any fallback here.
    let normalized: string = CLAUDE_MODELS.SONNET;
    if (requestedModelLower.includes("opus")) {
      // Prefer the exact requested model string if it includes "opus"
      normalized = requestedModel || CLAUDE_MODELS.OPUS;
    } else if (requestedModelLower.includes("sonnet")) {
      normalized = requestedModel || CLAUDE_MODELS.SONNET;
    } else if (requestedModelLower.includes("haiku")) {
      normalized = CLAUDE_MODELS.HAIKU;
    } else if (requestedModelLower.startsWith("claude")) {
      normalized = requestedModel || CLAUDE_MODELS.SONNET;
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
  [CLAUDE_MODELS.OPUS]: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
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
 * Verified against `@anthropic-ai/sdk@^0.92`: Opus 4.8 is a non-breaking upgrade
 * from 4.7 (same adaptive-thinking + effort surface; no sampling params).
 *
 * NOTE: New code should use selectModelForTask() for cost optimization.
 */
export const CLAUDE_REASONING_MODEL_DEFAULT: string =
  process.env.ANTHROPIC_MODEL || CLAUDE_MODELS.OPUS;

/**
 * @deprecated Prefer {@link CLAUDE_REASONING_MODEL_DEFAULT} — this name
 * sounds like the global default but only applies to the off-call reasoning
 * layer (briefs, coaching, post-call analysis). Voice runtime uses Sonnet via
 * {@link VAPI_TENANT_DEFAULT_MODEL}.
 */
export const CLAUDE_MODEL_DEFAULT: string = CLAUDE_REASONING_MODEL_DEFAULT;

/**
 * @deprecated Use CLAUDE_REASONING_MODEL_DEFAULT or selectModelForTask().
 */
export const DEFAULT_MODEL = CLAUDE_REASONING_MODEL_DEFAULT;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WIRELINE LLM TIERING ARCHITECTURE (Single Source of Truth)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Quality-first, latency-aware. Different models for different jobs:
 *
 *   • Voice Runtime    → Claude Sonnet 4.6  (smartest model in voice's
 *                                            latency class; TTFT 300–500 ms)
 *   • Voice Fallback   → Gemini 3.5 Flash   (speed-only backup for outages)
 *   • Reasoning Layer  → Claude Opus 4.8    (briefs, coaching, post-call,
 *                                            daily brief — async, depth pays off)
 *   • Simple Tasks     → Claude Haiku 4.5   (classification, extraction)
 *   • Grounded Search  → Gemini 2.5 Flash   (native googleSearchRetrieval)
 *
 * RATIONALE
 *
 * Voice calls live or die on the gap between caller-stops-talking and
 * agent-first-audio. Opus 4.7 produces deeper, more adaptive replies but
 * routinely takes 1.5–2.5 s to ship the first token against an 18 KB
 * system prompt — long enough that callers say "hello? are you there?"
 * Sonnet 4.6 keeps TTFT in the 300–500 ms range on the same prompt and
 * is still the strongest voice-AI model in the market for adaptive tone,
 * tool-call reliability, and conversational consistency.
 *
 * The deep-reasoning paths (pre-call briefs, post-call analysis, daily
 * brief generation, coaching) all run *outside* the live call. The user
 * never waits on them. We pay Opus 4.7's latency tax exactly zero times
 * during a call and reap its depth on every artefact we produce.
 *
 * TIER MAP
 *
 *   Voice Runtime        : Claude Sonnet 4.6  (VAPI_TENANT_DEFAULT_MODEL)
 *   Voice Fallback       : Gemini 3.5 Flash   (VAPI_VOICE_FALLBACK_MODEL)
 *   Reasoning (default)  : Claude Opus 4.8    (CLAUDE_REASONING_MODEL_DEFAULT)
 *   Post-call / daily    : Claude Opus 4.8    (complexity: "complex")
 *   Reasoning (simple)   : Claude Haiku 4.5   (selectModelForTask("simple"))
 *   Grounded Search      : Gemini 2.5 Flash   (native googleSearchRetrieval)
 *
 * FILES THAT ENFORCE THIS
 *
 *   src/lib/claude-models.ts          — constants and resolveVapiVoiceModelSelection
 *   src/lib/vapi-assistant-factory.ts — reads voiceLlmProvider/Model from settings
 *   src/lib/vapi-client.ts            — same, for outbound
 *   src/lib/claude-recipes.ts         — brief, coach, postCallAnalysis, dailyBrief
 *   src/routes/health-routes.ts       — exposes tiering to /api/health/internal
 *   src/routes/health-routes.ts       — /api/health/models live-probes each tier
 *
 * COST MODEL (approximate, current generation)
 *
 *   Voice (Sonnet 4.6)    : $3 / $15 per 1M tokens   — fast + smart
 *   Voice Fallback (Flash) : $0.15 / $1.25 per 1M    — outage-only
 *   Reasoning (Opus 4.8)  : $15 / $75 per 1M tokens  — high-value, low-volume
 *   Simple (Haiku 4.5)    : $1 / $5 per 1M tokens    — high-volume utility
 *
 * When a higher-tier model ships at Sonnet's latency profile, this comment
 * gets revised. Until then, the split above is the production contract.
 */
