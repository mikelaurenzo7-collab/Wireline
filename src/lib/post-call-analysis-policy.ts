import { OPENAI_MODELS } from "./ai-models";

/** Preserve the legacy starter-cost switch while using the managed OpenAI path. */
export function postCallAnalysisOptions(input: {
  aiTier?: string | null;
  legacyUseFlash?: boolean;
}): { model?: string; maxTokens?: number } {
  return input.legacyUseFlash || input.aiTier === "starter"
    ? { model: OPENAI_MODELS.GPT_5_6_LUNA, maxTokens: 2048 }
    : {};
}
