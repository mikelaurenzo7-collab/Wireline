/* eslint-disable @typescript-eslint/no-explicit-any -- vendor API responses are not fully typed. */
import { fetchWithTimeout, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { groundedSearch } from "./gemini-brain";

export type FreshResearchMode =
  | "perplexity_live"
  | "gemini_grounded"
  | "gemini_flash_fallback"
  | "unavailable";

export interface FreshResearchResult {
  answer: string;
  sources: { title?: string; uri?: string }[];
  mode: FreshResearchMode;
}

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || "sonar";
const MAX_QUERY_CHARS = 600;
const MAX_ANSWER_CHARS = 1_000;
/**
 * Mid-call *web research* HTTP timeout only — NOT a call-duration or billing cap.
 * PSTN calls run as long as the conversation needs; minutes bill from included pool
 * then prepaid Conversation Balance (see `voice-usage.ts` / `plan-catalog.ts`).
 * Keep this short so the caller is not held in silence while Perplexity/Gemini runs.
 */
const LIVE_RESEARCH_TIMEOUT_MS = Number(process.env.LIVE_RESEARCH_TIMEOUT_MS || 8_000);

function cleanQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
}

function cleanVoiceAnswer(answer: string): string {
  const trimmed = answer.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_ANSWER_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_ANSWER_CHARS)}…`;
}

function parsePerplexityCitations(payload: any): { title?: string; uri?: string }[] {
  const citations = Array.isArray(payload?.citations) ? payload.citations : [];
  return citations
    .map((citation: unknown) => {
      if (typeof citation === "string") return { uri: citation };
      if (citation && typeof citation === "object") {
        const c = citation as { title?: unknown; url?: unknown; uri?: unknown };
        return {
          title: typeof c.title === "string" ? c.title : undefined,
          uri:
            typeof c.url === "string" ? c.url : typeof c.uri === "string" ? c.uri : undefined,
        };
      }
      return null;
    })
    .filter((source: { title?: string; uri?: string } | null): source is { title?: string; uri?: string } =>
      Boolean(source?.title || source?.uri),
    )
    .slice(0, 5);
}

async function runPerplexityResearch(query: string): Promise<FreshResearchResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
  if (!apiKey) return null;

  const safeQuery = cleanQuery(query);
  if (!safeQuery) {
    return {
      answer: "Could you tell me what you'd like me to look up?",
      sources: [],
      mode: "perplexity_live",
    };
  }

  try {
    const response = await fetchWithTimeout(
      PERPLEXITY_API_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: PERPLEXITY_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are Wireline's live public-research tool for phone agents. Answer in two concise sentences, use current public information, and avoid guessing. Include the most relevant facts only. Do not expose raw JSON, markdown tables, or internal tooling details.",
            },
            { role: "user", content: safeQuery },
          ],
          temperature: 0.2,
          max_tokens: 450,
        }),
      },
      LIVE_RESEARCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Perplexity returned ${response.status}`);
    }

    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("Perplexity returned an empty answer");

    return {
      answer: cleanVoiceAnswer(answer),
      sources: parsePerplexityCitations(payload),
      mode: "perplexity_live",
    };
  } catch (err) {
    log.warn("Perplexity live research failed; falling back to Gemini grounded search", {
      error: getErrorMessage(err),
    });
    return null;
  }
}

export async function freshPublicResearch(query: string): Promise<FreshResearchResult> {
  const perplexity = await runPerplexityResearch(query);
  if (perplexity) return perplexity;

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
