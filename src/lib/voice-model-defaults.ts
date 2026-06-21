import { GEMINI_MODELS, OPENAI_MODELS } from "./ai-models";

type DefaultVoiceProvider = "openrouter" | "google" | "openai";
const configuredOpenRouterDefault = process.env.WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL?.trim();
export const WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL =
  configuredOpenRouterDefault || "openai/gpt-4o";
export const WIRELINE_DEFAULT_LOW_COST_PROVIDER: DefaultVoiceProvider = "openai";
export const WIRELINE_DEFAULT_LOW_COST_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_TENANT_DEFAULT_PROVIDER: DefaultVoiceProvider = "openai";
export const VAPI_SHOWCASE_PROVIDER: DefaultVoiceProvider = "openai";
export const VAPI_TENANT_DEFAULT_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_SHOWCASE_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_PREMIUM_MODEL = OPENAI_MODELS.GPT_4O;
export const VAPI_VOICE_FALLBACK_PROVIDER: DefaultVoiceProvider = "google";
export const VAPI_VOICE_FALLBACK_MODEL = GEMINI_MODELS.FLASH_3_5;
