/**
 * Wireline managed AI runtime.
 * OpenAI is primary, Gemini is automatic failure fallback, and OpenRouter is
 * honored only for an explicit agent-selected model.
 */
export * from "./ai-models";
export * from "./ai-audit";
export * from "./ai-client";
export * from "./ai-structured";
