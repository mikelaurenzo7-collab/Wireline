import { STRUCTURED_PRIMARY_MODEL } from "./ai-models";

/**
 * Structured planning model policy.
 * Wireline-owned structured turns run through the managed OpenAI-first runtime
 * (GPT-5.6 Terra via the direct OpenAI Responses API), with Gemini and then the
 * Vercel AI Gateway as ordered fallbacks; direct xAI stays explicit opt-in.
 */
export const STRUCTURED_RUNTIME_MODELS = {
  STANDARD: STRUCTURED_PRIMARY_MODEL,
} as const;

export const STRUCTURED_DIRECTOR_DEEP_MODEL =
  process.env.WIRELINE_DIRECTOR_DEEP_MODEL?.trim() || STRUCTURED_PRIMARY_MODEL;
