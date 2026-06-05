/**
 * Curated OpenRouter models for Director chat — company key, per-tenant preference.
 * Live catalog is merged when OPENROUTER_API_KEY is set (see fetchOpenRouterCatalog).
 */
import { isOpenRouterModelId } from "./director-model-selection";

export type OpenRouterModelCategory =
  | "wireline_recommended"
  | "reasoning"
  | "coding"
  | "creative"
  | "research"
  | "fast";

export interface OpenRouterModelOption {
  id: string;
  label: string;
  description: string;
  category: OpenRouterModelCategory;
  /** USD per 1M tokens (approximate, for audit estimates). */
  inputPerMillion?: number;
  outputPerMillion?: number;
}

/** Hand-picked models that map well to Director workloads. */
export const CURATED_OPENROUTER_MODELS: OpenRouterModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    description: "Balanced strategy, writing, and tool use (Wireline voice tier)",
    category: "wireline_recommended",
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    description: "Deep reasoning and complex plans (Wireline reasoning tier)",
    category: "reasoning",
    inputPerMillion: 5,
    outputPerMillion: 25,
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    description: "General-purpose creative and analysis",
    category: "creative",
    inputPerMillion: 2.5,
    outputPerMillion: 10,
  },
  {
    id: "openai/o3-mini",
    label: "o3-mini",
    description: "Fast structured reasoning",
    category: "reasoning",
    inputPerMillion: 1.1,
    outputPerMillion: 4.4,
  },
  {
    id: "google/gemini-2.5-pro-preview",
    label: "Gemini 2.5 Pro",
    description: "Long-context research and synthesis",
    category: "research",
    inputPerMillion: 1.25,
    outputPerMillion: 10,
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    label: "DeepSeek V3",
    description: "Strong coding and technical drafts",
    category: "coding",
    inputPerMillion: 0.27,
    outputPerMillion: 1.1,
  },
  {
    id: "qwen/qwen3-235b-a22b",
    label: "Qwen3 235B",
    description: "Large open model for analysis",
    category: "coding",
    inputPerMillion: 0.14,
    outputPerMillion: 0.6,
  },
  {
    id: "perplexity/sonar-pro",
    label: "Sonar Pro",
    description: "Web-grounded research answers",
    category: "research",
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    description: "Fast open-weight general assistant",
    category: "fast",
    inputPerMillion: 0.1,
    outputPerMillion: 0.1,
  },
];

const curatedById = new Map(CURATED_OPENROUTER_MODELS.map((m) => [m.id, m]));

export function labelForOpenRouterModel(id: string): string {
  return curatedById.get(id)?.label ?? id.split("/").pop() ?? id;
}

export function estimateOpenRouterCostUsd(
  modelId: string,
  usage: { input_tokens: number; output_tokens: number },
): number {
  const meta = curatedById.get(modelId);
  const inRate = meta?.inputPerMillion ?? 3;
  const outRate = meta?.outputPerMillion ?? 15;
  return (usage.input_tokens * inRate) / 1_000_000 + (usage.output_tokens * outRate) / 1_000_000;
}

let catalogCache: { at: number; models: OpenRouterModelOption[] } | null = null;
const CATALOG_TTL_MS = 60 * 60 * 1000;

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

/** Merge curated list with OpenRouter /models (cached 1h). */
export async function listOpenRouterModelsForDirector(): Promise<{
  enabled: boolean;
  curated: OpenRouterModelOption[];
  catalog: OpenRouterModelOption[];
}> {
  const curated = CURATED_OPENROUTER_MODELS;
  if (!isOpenRouterConfigured()) {
    return { enabled: false, curated, catalog: curated };
  }

  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return { enabled: true, curated, catalog: catalogCache.models };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.APP_URL || "https://trywireline.com",
        "X-Title": "Wireline Director",
      },
    });
    if (!res.ok) {
      return { enabled: true, curated, catalog: curated };
    }
    const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const fromApi: OpenRouterModelOption[] = [];
    for (const row of body.data ?? []) {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id || curatedById.has(id)) continue;
      if (!isOpenRouterModelId(id)) continue;
      const name = typeof row.name === "string" ? row.name : id;
      const pricing = row.pricing as { prompt?: string; completion?: string } | undefined;
      const inputPerMillion = pricing?.prompt ? Number(pricing.prompt) * 1_000_000 : undefined;
      const outputPerMillion = pricing?.completion
        ? Number(pricing.completion) * 1_000_000
        : undefined;
      fromApi.push({
        id,
        label: name,
        description: "OpenRouter catalog",
        category: "fast",
        inputPerMillion: Number.isFinite(inputPerMillion) ? inputPerMillion : undefined,
        outputPerMillion: Number.isFinite(outputPerMillion) ? outputPerMillion : undefined,
      });
    }
    const merged = [...curated, ...fromApi.slice(0, 40)];
    catalogCache = { at: now, models: merged };
    return { enabled: true, curated, catalog: merged };
  } catch {
    return { enabled: true, curated, catalog: curated };
  }
}
