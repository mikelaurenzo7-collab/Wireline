import { OPENAI_STRUCTURED_PRIMARY_MODEL } from "./ai-models";

/**
 * Structured planning model policy.
 * Wireline-owned structured turns run through the managed OpenAI-first runtime.
 */
export const STRUCTURED_RUNTIME_MODELS = {
  STANDARD: OPENAI_STRUCTURED_PRIMARY_MODEL,
} as const;

export const STRUCTURED_DIRECTOR_DEEP_MODEL =
  process.env.WIRELINE_DIRECTOR_DEEP_MODEL?.trim() || OPENAI_STRUCTURED_PRIMARY_MODEL;
