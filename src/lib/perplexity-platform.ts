/* eslint-disable @typescript-eslint/no-explicit-any -- Perplexity API envelopes can vary by product surface. */
import { fetchWithTimeout, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export type PerplexityResearchDepth = "fast" | "deep";

export interface PerplexitySource {
  title?: string;
  uri?: string;
  snippet?: string;
}

export interface PerplexityResearchResult {
  answer: string;
  sources: PerplexitySource[];
  route: "search_chat" | "agent";
  semanticRerank: boolean;
}

export interface PerplexityResearchOptions {
  depth?: PerplexityResearchDepth;
  semanticRerank?: boolean;
  timeoutMs?: number;
}

const API_ROOT = (process.env.PERPLEXITY_API_BASE_URL || "https://api.perplexity.ai").replace(/\/$/, "");
const CHAT_URL = process.env.PERPLEXITY_CHAT_API_URL || `${API_ROOT}/chat/completions`;
const SEARCH_URL = process.env.PERPLEXITY_SEARCH_API_URL || `${API_ROOT}/search`;
const CHAT_MODEL = process.env.PERPLEXITY_MODEL || "sonar";
const AGENT_URL = process.env.PERPLEXITY_AGENT_API_URL?.trim() || "";
const AGENT_MODEL = process.env.PERPLEXITY_AGENT_MODEL?.trim() || "sonar-deep-research";
const EMBEDDINGS_URL = process.env.PERPLEXITY_EMBEDDINGS_API_URL?.trim() || "";
const EMBEDDINGS_MODEL = process.env.PERPLEXITY_EMBEDDINGS_MODEL?.trim() || "";
const DEFAULT_TIMEOUT_MS = Number(process.env.LIVE_RESEARCH_TIMEOUT_MS || 8_000);
const MAX_SEARCH_RESULTS = 8;
const MAX_QUERY_CHARS = 600;
const MAX_ANSWER_CHARS = 1_000;

function apiKey(): string {
  return process.env.PERPLEXITY_API_KEY?.trim() || "";
}

function cleanQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
}

function cleanAnswer(answer: string): string {
  const normalized = answer.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_ANSWER_CHARS) return normalized;
  return `${normalized.slice(0, MAX_ANSWER_CHARS)}…`;
}

function dedupeSources(sources: PerplexitySource[]): PerplexitySource[] {
  const seen = new Set<string>();
  const out: PerplexitySource[] = [];
  for (const source of sources) {
    const uri = source.uri?.trim();
    const title = source.title?.trim();
    const key = uri || title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...(title ? { title } : {}),
      ...(uri ? { uri } : {}),
      ...(source.snippet?.trim() ? { snippet: source.snippet.trim() } : {}),
    });
    if (out.length >= MAX_SEARCH_RESULTS) break;
  }
  return out;
}

function parseSearchSources(payload: any): PerplexitySource[] {
  const candidates = [payload?.results, payload?.data, payload?.search_results, payload?.organic].find(
    Array.isArray,
  );
  if (!Array.isArray(candidates)) return [];
  return dedupeSources(
    candidates.map((item: any) => ({
      title: typeof item?.title === "string" ? item.title : undefined,
      uri:
        typeof item?.url === "string"
          ? item.url
          : typeof item?.uri === "string"
            ? item.uri
            : typeof item?.link === "string"
              ? item.link
              : undefined,
      snippet:
        typeof item?.snippet === "string"
          ? item.snippet
          : typeof item?.description === "string"
            ? item.description
            : typeof item?.text === "string"
              ? item.text
              : undefined,
    })),
  );
}

function parseChatSources(payload: any): PerplexitySource[] {
  const citations = Array.isArray(payload?.citations) ? payload.citations : [];
  return dedupeSources(
    citations.map((citation: any) => {
      if (typeof citation === "string") return { uri: citation };
      return {
        title: typeof citation?.title === "string" ? citation.title : undefined,
        uri:
          typeof citation?.url === "string"
            ? citation.url
            : typeof citation?.uri === "string"
              ? citation.uri
              : undefined,
      };
    }),
  );
}

async function readJson(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  if (!response.ok) throw new Error(`Perplexity returned ${response.status}`);
  return response.json();
}

export async function searchPerplexityWeb(
  query: string,
  opts?: { timeoutMs?: number; semanticRerank?: boolean },
): Promise<{ sources: PerplexitySource[]; semanticRerank: boolean } | null> {
  const key = apiKey();
  const safeQuery = cleanQuery(query);
  if (!key || !safeQuery) return null;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const payload = await readJson(
      SEARCH_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: safeQuery, max_results: MAX_SEARCH_RESULTS }),
      },
      timeoutMs,
    );
    const sources = parseSearchSources(payload);
    if (sources.length === 0) return null;

    if (!opts?.semanticRerank || !EMBEDDINGS_URL || !EMBEDDINGS_MODEL) {
      return { sources, semanticRerank: false };
    }

    const ranked = await rerankWithEmbeddings(safeQuery, sources, timeoutMs);
    return ranked ? { sources: ranked, semanticRerank: true } : { sources, semanticRerank: false };
  } catch (error) {
    log.warn("Perplexity Search API unavailable", { error: getErrorMessage(error) });
    return null;
  }
}

async function runChatResearch(query: string, timeoutMs: number): Promise<{ answer: string; sources: PerplexitySource[] } | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const payload = await readJson(
      CHAT_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are Wireline's live public-research tool. Answer in two concise sentences using current public information. Do not guess. Do not expose raw JSON, markdown tables, or internal tooling details.",
            },
            { role: "user", content: query },
          ],
          temperature: 0.2,
          max_tokens: 450,
        }),
      },
      timeoutMs,
    );
    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) return null;
    return { answer: cleanAnswer(answer), sources: parseChatSources(payload) };
  } catch (error) {
    log.warn("Perplexity Sonar research unavailable", { error: getErrorMessage(error) });
    return null;
  }
}

async function runAgentResearch(query: string, timeoutMs: number): Promise<PerplexityResearchResult | null> {
  const key = apiKey();
  if (!key || !AGENT_URL) return null;
  try {
    const payload = await readJson(
      AGENT_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: AGENT_MODEL, input: query }),
      },
      timeoutMs,
    );
    const answer =
      (typeof payload?.output_text === "string" && payload.output_text) ||
      (typeof payload?.answer === "string" && payload.answer) ||
      payload?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) return null;
    const sources = dedupeSources([
      ...parseSearchSources(payload),
      ...parseChatSources(payload),
    ]);
    return {
      answer: cleanAnswer(answer),
      sources,
      route: "agent",
      semanticRerank: false,
    };
  } catch (error) {
    log.warn("Perplexity Agent API unavailable; falling back to fast research", {
      error: getErrorMessage(error),
    });
    return null;
  }
}

async function requestEmbeddings(inputs: string[], timeoutMs: number): Promise<number[][] | null> {
  const key = apiKey();
  if (!key || !EMBEDDINGS_URL || !EMBEDDINGS_MODEL || inputs.length === 0) return null;
  try {
    const payload = await readJson(
      EMBEDDINGS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: EMBEDDINGS_MODEL, input: inputs }),
      },
      timeoutMs,
    );
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const embeddings = rows
      .map((row: any) => row?.embedding)
      .filter((value: unknown): value is number[] =>
        Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === "number"),
      );
    return embeddings.length === inputs.length ? embeddings : null;
  } catch (error) {
    log.warn("Perplexity Embeddings API unavailable; preserving provider-ranked search", {
      error: getErrorMessage(error),
    });
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function rerankWithEmbeddings(
  query: string,
  sources: PerplexitySource[],
  timeoutMs: number,
): Promise<PerplexitySource[] | null> {
  const texts = sources.map((source) =>
    [source.title, source.snippet, source.uri].filter(Boolean).join(" — ").slice(0, 1_500),
  );
  const embeddings = await requestEmbeddings([query, ...texts], timeoutMs);
  if (!embeddings || embeddings.length !== sources.length + 1) return null;
  const [queryEmbedding, ...sourceEmbeddings] = embeddings;
  return sources
    .map((source, index) => ({ source, score: cosineSimilarity(queryEmbedding, sourceEmbeddings[index]) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.source);
}

export async function researchPerplexity(
  query: string,
  options: PerplexityResearchOptions = {},
): Promise<PerplexityResearchResult | null> {
  const key = apiKey();
  const safeQuery = cleanQuery(query);
  if (!key || !safeQuery) return null;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (options.depth === "deep") {
    const agent = await runAgentResearch(safeQuery, timeoutMs);
    if (agent) return agent;
  }

  // Search and Sonar run in parallel: richer source metadata without adding a
  // second serial network hop to latency-sensitive call turns.
  const [search, chat] = await Promise.all([
    searchPerplexityWeb(safeQuery, {
      timeoutMs,
      semanticRerank: options.semanticRerank === true,
    }),
    runChatResearch(safeQuery, timeoutMs),
  ]);
  if (!chat) return null;
  return {
    answer: chat.answer,
    sources: dedupeSources([...(search?.sources || []), ...chat.sources]),
    route: "search_chat",
    semanticRerank: search?.semanticRerank === true,
  };
}

export function getPerplexityCapabilityPosture() {
  const key = Boolean(apiKey());
  return {
    key,
    search: key,
    sonar: key,
    agent: key && Boolean(AGENT_URL),
    embeddings: key && Boolean(EMBEDDINGS_URL) && Boolean(EMBEDDINGS_MODEL),
  } as const;
}
