/**
 * @deprecated Import from `./ai-runtime`.
 *
 * This compatibility barrel deliberately contains no provider implementation.
 * Wireline managed work is OpenAI-first with Gemini only as failure fallback.
 */
export * from "./ai-runtime";
export {
  VAPI_PREMIUM_MODEL,
  VAPI_SHOWCASE_MODEL,
  VAPI_SHOWCASE_PROVIDER,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  VAPI_VOICE_FALLBACK_PROVIDER,
} from "./voice-model-defaults";
