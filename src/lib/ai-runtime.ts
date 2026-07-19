/**
 * Wireline managed AI runtime.
 * Grok 4.5 (direct xAI) is primary; OpenAI and Gemini are ordered automatic
 * fallbacks, and the Vercel AI Gateway is the last-resort multi-model route.
 */
export * from "./ai-models";
export * from "./ai-audit";
export * from "./ai-client";
export * from "./ai-structured";
