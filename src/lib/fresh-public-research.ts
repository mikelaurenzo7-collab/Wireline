import { groundedSearch } from "./gemini-brain";
import { researchPerplexity, type PerplexitySource } from "./perplexity-platform";

export type FreshResearchMode =
  | "perplexity_live"
  | "perplexity_agent"
  | "gemini_grounded"
  | "gemini_flash_fallback"
  | "unavailable";

export interface FreshResearchResult {
  answer: string;
  sources: { title?: string; uri?: string }[];
  mode: FreshResearchMode;
}

export interface FreshResearchOptions {
  /**
   * `fast` is safe inside a live call. `deep` is reserved for Director/research
   * jobs because Perplexity agent runs can exceed a conversational latency budget.
   */
  depth?: "fast" | "deep";
  /** Semantic reranking is useful for async research jobs, not live-call turns. */
  semanticRerank?: boolean;
}

const MAX_ANSWER_CHARS = 1_000;

function cleanVoiceAnswer(answer: string): string {
  const trimmed = answer.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_ANSWER_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_ANSWER_CHARS)}…`;
}

function compactSources(sources: PerplexitySource[]): { title?: string; uri?: string }[] {
  return sources
    .map((source) => ({
      ...(source.title ? { title: source.title } : {}),
      ...(source.uri ? { uri: source.uri } : {}),
    }))
    .filter((source) => source.title || source.uri)
    .slice(0, 5);
}

export async function freshPublicResearch(
  query: string,
  options: FreshResearchOptions = {},
): Promise<FreshResearchResult> {
  const perplexity = await researchPerplexity(query, {
    depth: options.depth || "fast",
    semanticRerank: options.semanticRerank === true,
  });
  if (perplexity) {
    return {
      answer: cleanVoiceAnswer(perplexity.answer),
      sources: compactSources(perplexity.sources),
      mode: perplexity.route === "agent" ? "perplexity_agent" : "perplexity_live",
    };
  }

  const gemini = await groundedSearch(query);
  return {
    answer: cleanVoiceAnswer(gemini.answer),
    sources: gemini.sources,
    mode:
      gemini.groundingMode === "pro_grounded"
        ? "gemini_grounded"
        : gemini.groundingMode === "flash_fallback"
          ? "gemini_flash_fallback"
          : "unavailable",
  };
}
