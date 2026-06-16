import { GEMINI_MODELS } from "./claude-models";

export const VAPI_TENANT_DEFAULT_PROVIDER = "xai" as const;
export const VAPI_SHOWCASE_PROVIDER = "xai" as const;
export const VAPI_TENANT_DEFAULT_MODEL = "grok-4.3";
export const VAPI_SHOWCASE_MODEL = "grok-4.3";
export const VAPI_PREMIUM_MODEL = "grok-4.3";
export const VAPI_VOICE_FALLBACK_PROVIDER = "google" as const;
export const VAPI_VOICE_FALLBACK_MODEL = GEMINI_MODELS.FLASH_3_5;
