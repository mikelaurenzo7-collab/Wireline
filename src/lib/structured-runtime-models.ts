import { STRUCTURED_PRIMARY_MODEL } from "./ai-models";

/**
 * Structured planning model policy.
 * Wireline-owned structured turns run through the managed Grok-first runtime
 * (Grok 4.5 via the direct xAI Responses API), with direct OpenAI, Gemini,
 * and then the Vercel AI Gateway as ordered fallbacks.
 */
export const STRUCTURED_RUNTIME_MODELS = {
  STANDARD: STRUCTURED_PRIMARY_MODEL,
} as const;

export const STRUCTURED_DIRECTOR_DEEP_MODEL =
  process.env.WIRELINE_DIRECTOR_DEEP_MODEL?.trim() || STRUCTURED_PRIMARY_MODEL;
