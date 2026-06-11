import { CLAUDE_DIRECTOR_MODEL, CLAUDE_MODELS } from "./claude-models";

export type WirelineDirectorTier = "auto" | "sonnet" | "opus";

export type DirectorChatModelSelection =
  | { provider: "wireline"; tier: WirelineDirectorTier }
  | { provider: "openrouter"; modelId: string };

export const DEFAULT_DIRECTOR_MODEL_SELECTION: DirectorChatModelSelection = {
  provider: "wireline",
  tier: "auto",
};

const WIRELINE_TIERS = new Set<WirelineDirectorTier>(["auto", "sonnet", "opus"]);

export function parseDirectorChatModelSelection(raw: unknown): DirectorChatModelSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;

  if (data.provider === "wireline") {
    const tier = typeof data.tier === "string" ? data.tier : "auto";
    if (!WIRELINE_TIERS.has(tier as WirelineDirectorTier)) return null;
    return { provider: "wireline", tier: tier as WirelineDirectorTier };
  }

  if (data.provider === "openrouter") {
    const modelId = typeof data.modelId === "string" ? data.modelId.trim() : "";
    if (!isOpenRouterModelId(modelId)) return null;
    return { provider: "openrouter", modelId };
  }

  return null;
}

export type ResolvedDirectorLlm = {
  provider: "wireline" | "openrouter";
  model: string;
  modelKind: "sonnet" | "opus" | "custom";
  modelLabel: string;
  openRouterModelId?: string;
  deepThink: boolean;
  maxTokens: number;
};

export function resolveDirectorLlm(input: {
  selection?: DirectorChatModelSelection | null;
  autoOpus?: boolean;
  deepThink?: boolean;
  longDeliverable?: boolean;
  claudeSonnet?: string;
  claudeOpus?: string;
  modelLabelForOpenRouter?: (modelId: string) => string;
}): ResolvedDirectorLlm {
  const selection = input.selection ?? DEFAULT_DIRECTOR_MODEL_SELECTION;
  const claudeSonnet = input.claudeSonnet ?? CLAUDE_MODELS.SONNET;
  const claudeOpus = input.claudeOpus ?? CLAUDE_DIRECTOR_MODEL;

  if (selection.provider === "openrouter") {
    return {
      provider: "openrouter",
      model: selection.modelId,
      modelKind: "custom",
      modelLabel: input.modelLabelForOpenRouter?.(selection.modelId) ?? selection.modelId,
      openRouterModelId: selection.modelId,
      deepThink: false,
      maxTokens: input.longDeliverable ? 5000 : 2500,
    };
  }

  const useOpus =
    selection.tier === "opus" || (selection.tier === "auto" && input.autoOpus === true);
  const modelKind = useOpus ? "opus" : "sonnet";

  return {
    provider: "wireline",
    model: useOpus ? claudeOpus : claudeSonnet,
    modelKind,
    modelLabel: useOpus ? "Opus" : "Sonnet",
    deepThink: useOpus && input.deepThink === true,
    maxTokens: input.longDeliverable ? (useOpus ? 6000 : 4000) : useOpus ? 3200 : 2200,
  };
}

/**
 * Returns true if the given ID looks like a valid OpenRouter model ID.
 * Used by openrouter-models.ts to filter the live catalog.
 * OpenRouter IDs are typically in "provider/model" format.
 */
export function isOpenRouterModelId(id: string): boolean {
  if (typeof id !== "string" || !id) return false;
  if (id.length > 160) return false;
  if (id.includes("..") || /\s/.test(id)) return false;
  const lower = id.toLowerCase();
  if (lower.startsWith("wireline/") || lower.startsWith("xai/") || lower.startsWith("grok/")) {
    return false;
  }
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
}
