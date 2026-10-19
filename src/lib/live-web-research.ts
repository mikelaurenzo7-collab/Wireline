/**
 * Live public web research for Bots: fresh facts that are not in the owner's
 * knowledge (business hours elsewhere, public pricing, news, regulations).
 *
 * Runs on the managed structured provider's built-in web search through the
 * Responses API. Usage and the provider-reported charge are recorded like any
 * other AI call. Callers never see the vendor; answers are short and cited.
 */
import { XAI_STRUCTURED_PRIMARY_MODEL } from "./ai-models";
import { recordUsage } from "./ai-audit";
import { normalizeProviderReportedCostUsd } from "./ai-provider-cost";
import { log } from "./server-logger";

const RESEARCH_TIMEOUT_MS = 20_000;
const MAX_SOURCES = 5;

export type LiveWebResearch = {
  answer: string;
  sources: { title?: string; uri?: string }[];
  mode: "web_search" | "unavailable";
};

const UNAVAILABLE: LiveWebResearch = {
  answer: "Unable to look that up right now. I'll make a note and follow up.",
  sources: [],
  mode: "unavailable",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Text and url citations from a Responses payload. */
export function parseWebResearchPayload(payload: unknown): {
  answer: string;
  sources: { title?: string; uri?: string }[];
} {
  const root = asRecord(payload);
  const texts: string[] = [];
  const sources = new Map<string, { title?: string; uri?: string }>();
  const addSource = (uri: unknown, title?: unknown) => {
    if (typeof uri !== "string" || !/^https?:\/\//i.test(uri) || sources.has(uri)) return;
    sources.set(uri, {
      uri,
      ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
    });
  };
  if (typeof root.output_text === "string" && root.output_text.trim()) texts.push(root.output_text);
  for (const item of asArray(root.output)) {
    for (const part of asArray(asRecord(item).content)) {
      const content = asRecord(part);
      if (!root.output_text && typeof content.text === "string") texts.push(content.text);
      for (const annotation of asArray(content.annotations)) {
        const note = asRecord(annotation);
        if (note.type === "url_citation") addSource(note.url, note.title);
      }
    }
  }
  for (const citation of asArray(root.citations)) {
    if (typeof citation === "string") addSource(citation);
    else addSource(asRecord(citation).url, asRecord(citation).title);
  }
  return {
    answer: texts.join("\n").replace(/\s+/g, " ").trim(),
    sources: [...sources.values()].slice(0, MAX_SOURCES),
  };
}

export async function liveWebResearch(query: string): Promise<LiveWebResearch> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  const question = query.replace(/\s+/g, " ").trim().slice(0, 1_000);
  if (!apiKey || !question) return UNAVAILABLE;
  const model = XAI_STRUCTURED_PRIMARY_MODEL;
  const started = Date.now();
  try {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        instructions:
          "Answer with current public information from the web in two or three short sentences suitable to say on a phone call. Say plainly when you could not confirm something.",
        input: [{ role: "user", content: question }],
        tools: [{ type: "web_search" }],
        max_output_tokens: 600,
        store: false,
      }),
    });
    if (!response.ok) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      log.warn("Live web research was rejected", { status: response.status });
      return UNAVAILABLE;
    }
    const payload = asRecord(await response.json());
    const usage = asRecord(payload.usage);
    const cached = asRecord(usage.input_tokens_details).cached_tokens;
    const ticks = usage.cost_in_usd_ticks;
    recordUsage(
      model,
      {
        model: typeof payload.model === "string" ? payload.model : model,
        inference_provider: "xai",
        actual_cost_usd:
          typeof ticks === "number" && Number.isFinite(ticks) && ticks >= 0
            ? normalizeProviderReportedCostUsd(ticks / 1e10)
            : undefined,
        usage: {
          input_tokens: Number(usage.input_tokens) || 0,
          output_tokens: Number(usage.output_tokens) || 0,
          cache_read_input_tokens: Number(cached) || 0,
          cache_creation_input_tokens: 0,
        },
      },
      Date.now() - started,
    );
    const parsed = parseWebResearchPayload(payload);
    return parsed.answer ? { ...parsed, mode: "web_search" } : UNAVAILABLE;
  } catch (error) {
    log.warn("Live web research failed", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return UNAVAILABLE;
  }
}
