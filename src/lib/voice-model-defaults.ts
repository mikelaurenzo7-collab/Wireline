import { GEMINI_MODELS, OPENAI_MODELS } from "./claude-models";

type DefaultVoiceProvider = "openrouter" | "google" | "openai";

const configuredOpenRouterDefault = process.env.WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL?.trim();

/** OpenRouter is only used when an operator explicitly selects it. */
export const WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL =
  configuredOpenRouterDefault || "google/gemini-3.5-flash";

/** Wireline-managed voice calls always start with Gemini. */
export const WIRELINE_DEFAULT_LOW_COST_PROVIDER: DefaultVoiceProvider = "google";
export const WIRELINE_DEFAULT_LOW_COST_MODEL = GEMINI_MODELS.FLASH_3_5;

export const VAPI_TENANT_DEFAULT_PROVIDER: DefaultVoiceProvider = "google";
export const VAPI_SHOWCASE_PROVIDER: DefaultVoiceProvider = "google";
export const VAPI_TENANT_DEFAULT_MODEL = GEMINI_MODELS.FLASH_3_5;
export const VAPI_SHOWCASE_MODEL = GEMINI_MODELS.FLASH_3_5;
export const VAPI_PREMIUM_MODEL = GEMINI_MODELS.FLASH_3_5;

/** Automatic managed-runtime fallback: Gemini first, then OpenAI. */
export const VAPI_VOICE_FALLBACK_PROVIDER: DefaultVoiceProvider = "openai";
export const VAPI_VOICE_FALLBACK_MODEL = OPENAI_MODELS.GPT_4O;
