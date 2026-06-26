import { OPENAI_STRUCTURED_PRIMARY_MODEL } from "./ai-models";

/**
 * Legacy planner/director callers still import Claude-era model names.
 * Wireline now runs these structured turns through the managed primary model.
 */
export const CLAUDE_MODELS = {
  SONNET: OPENAI_STRUCTURED_PRIMARY_MODEL,
} as const;

export const CLAUDE_DIRECTOR_MODEL =
  process.env.WIRELINE_DIRECTOR_DEEP_MODEL?.trim() || OPENAI_STRUCTURED_PRIMARY_MODEL;
