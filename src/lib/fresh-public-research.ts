/* eslint-disable @typescript-eslint/no-explicit-any -- vendor API responses are not fully typed. */
import { log } from "./server-context";
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

function cleanQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
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
    const response = await fetch(PERPLEXITY_API_URL, {
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
              "You are Wireline's live public-research tool for phone agents. Answer in two concise sentences, use current public information, and avoid guessing. Include the most relevant facts only.",
          },
          { role: "user", content: safeQuery },
        ],
        temperature: 0.2,
        max_tokens: 450,
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity returned ${response.status}`);
    }

    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("Perplexity returned an empty answer");

    return {
      answer,
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
    answer: gemini.answer,
    sources: gemini.sources,
    mode:
      gemini.groundingMode === "pro_grounded"
        ? "gemini_grounded"
        : gemini.groundingMode === "flash_fallback"
          ? "gemini_flash_fallback"
          : "unavailable",
  };
}
