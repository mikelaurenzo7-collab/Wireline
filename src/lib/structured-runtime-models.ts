import { STRUCTURED_PRIMARY_MODEL } from "./ai-models";

/**
 * Structured planning model policy.
 * BotBound-owned structured turns run through the managed xAI-first runtime,
 * with OpenAI and the legacy Vercel AI Gateway as ordered continuity.
 */
export const STRUCTURED_RUNTIME_MODELS = {
  STANDARD: STRUCTURED_PRIMARY_MODEL,
} as const;

export const STRUCTURED_DIRECTOR_DEEP_MODEL =
  process.env.WIRELINE_DIRECTOR_DEEP_MODEL?.trim() || STRUCTURED_PRIMARY_MODEL;
