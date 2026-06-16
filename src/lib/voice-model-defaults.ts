import { GEMINI_MODELS } from "./claude-models";

type DefaultVoiceProvider = "openrouter" | "google";

const configuredOpenRouterDefault = process.env.WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL?.trim();

export const WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL =
  configuredOpenRouterDefault || "x-ai/grok-4.3";

export const WIRELINE_DEFAULT_LOW_COST_PROVIDER: DefaultVoiceProvider = configuredOpenRouterDefault
  ? "openrouter"
  : "google";

export const WIRELINE_DEFAULT_LOW_COST_MODEL =
  configuredOpenRouterDefault || GEMINI_MODELS.FLASH_3_5;

export const VAPI_TENANT_DEFAULT_PROVIDER = WIRELINE_DEFAULT_LOW_COST_PROVIDER;
export const VAPI_SHOWCASE_PROVIDER = WIRELINE_DEFAULT_LOW_COST_PROVIDER;
export const VAPI_TENANT_DEFAULT_MODEL = WIRELINE_DEFAULT_LOW_COST_MODEL;
export const VAPI_SHOWCASE_MODEL = WIRELINE_DEFAULT_LOW_COST_MODEL;
export const VAPI_PREMIUM_MODEL = WIRELINE_DEFAULT_LOW_COST_MODEL;
export const VAPI_VOICE_FALLBACK_PROVIDER = "google" as const;
export const VAPI_VOICE_FALLBACK_MODEL = GEMINI_MODELS.FLASH_3_5;
