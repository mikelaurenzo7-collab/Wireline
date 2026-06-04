/**
 * Director live web research — grounded search for market intel, competitors,
 * regulations, pricing, and news. Uses Gemini googleSearchRetrieval (same
 * stack as live agent gemini_ground).
 */
import { groundedSearch } from "./gemini-brain";
import { loadDirectorFeatureFlags } from "./director-feature-flags";

export interface DirectorResearchSource {
  title?: string;
  uri?: string;
}

export interface DirectorResearchContext {
  query: string;
  block: string;
  sources: DirectorResearchSource[];
  groundingMode: "pro_grounded" | "flash_fallback" | "unavailable";
}

const RESEARCH_SIGNAL =
  /\b(search|look\s*up|lookup|find out|research|investigate|competitors?|competition|market(?:ing)?|benchmark|pricing|price of|regulation|compliance|news|headline|who is|what(?:'s| is) the latest|current (?:price|rate|trend)|how much (?:does|do|is|are)|compare|versus|vs\.?|industry trend|best practice|statistics|data on|tell me about|charg(?:e|ing|es))\b/i;

const ACTION_ONLY =
  /^(text|call|email|send|deploy|create|update|change|turn on|turn off|enable|disable|approve|schedule)\b/i;

export function isDirectorWebResearchConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function wantsDirectorWebResearch(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 8) return false;
  if (ACTION_ONLY.test(trimmed) && !RESEARCH_SIGNAL.test(trimmed)) return false;
  return RESEARCH_SIGNAL.test(trimmed);
}

export function buildDirectorResearchQuery(
  operatorMessage: string,
  history: Array<{ role: string; content: string }> = [],
): string {
  const trimmed = operatorMessage.trim().slice(0, 800);
  if (trimmed.length >= 24) return trimmed;

  const recentOperator = history
    .filter((m) => m.role === "operator")
    .slice(-2)
    .map((m) => m.content.trim())
    .filter(Boolean);

  if (recentOperator.length === 0) return trimmed;
  return `${recentOperator.join(" — ")} — ${trimmed}`.slice(0, 800);
}

function formatResearchBlock(
  query: string,
  answer: string,
  sources: DirectorResearchSource[],
): string {
  const sourceLines =
    sources.length > 0
      ? sources
          .map((s, i) => `${i + 1}. ${s.title || "Source"}${s.uri ? ` — ${s.uri}` : ""}`)
          .join("\n")
      : "(no source URLs returned)";

  return `[LIVE WEB RESEARCH — synthesize into your reply; cite sources naturally when useful]
Query: ${query}
Findings:
${answer}

Sources:
${sourceLines}
[END LIVE WEB RESEARCH]`;
}

/**
 * When the operator needs fresh public intel, run grounded search before the
 * Director LLM turn so replies are CEO-grade, not stale training data.
 */
export async function fetchDirectorResearchContext(input: {
  operatorMessage: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<DirectorResearchContext | null> {
  const flags = loadDirectorFeatureFlags();
  if (!flags.webResearch || !isDirectorWebResearchConfigured()) return null;
  if (!wantsDirectorWebResearch(input.operatorMessage)) return null;

  const query = buildDirectorResearchQuery(input.operatorMessage, input.history ?? []);
  const grounded = await groundedSearch(query);
  if (!grounded.answer?.trim() || grounded.groundingMode === "unavailable") return null;

  return {
    query,
    block: formatResearchBlock(query, grounded.answer, grounded.sources),
    sources: grounded.sources,
    groundingMode: grounded.groundingMode,
  };
}

export function appendResearchToUserPrompt(
  user: string,
  researchBlock: string | undefined,
): string {
  if (!researchBlock) return user;
  return `${researchBlock}\n\n${user}`;
}
