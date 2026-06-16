/**
 * Wireline Claude Brain — barrel re-export.
 * ---------------------------------------------------------------------------
 * The implementation has been decomposed into focused modules for
 * maintainability. This file preserves backward compatibility so
 * existing `import * as claudeBrain from "./claude-brain"` and
 * named imports continue to work without changes.
 */

export * from "./claude-models";
export {
  VAPI_PREMIUM_MODEL,
  VAPI_SHOWCASE_MODEL,
  VAPI_SHOWCASE_PROVIDER,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  VAPI_VOICE_FALLBACK_PROVIDER,
} from "./voice-model-defaults";
export * from "./claude-audit";
export * from "./claude-client";
export * from "./claude-structured";
export * from "./claude-tools";
export * from "./claude-recipes";
