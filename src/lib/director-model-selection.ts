import { OPENAI_STRUCTURED_PRIMARY_MODEL } from "./claude-models";

/** Historical tier identifiers are retained for persisted selections. */
export type WirelineDirectorTier = "auto" | "sonnet" | "opus";
export type DirectorChatModelSelection =
  | { provider: "wireline"; tier: WirelineDirectorTier }
  | { provider: "openrouter"; modelId: string };

export const DEFAULT_DIRECTOR_OPENROUTER_MODEL =
  process.env.WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL?.trim() || "openai/gpt-4o";

export const DEFAULT_DIRECTOR_MODEL_SELECTION: DirectorChatModelSelection = {
  provider: "wireline",
  tier: "sonnet",
};

const TIERS = new Set<WirelineDirectorTier>(["auto", "sonnet", "opus"]);

export function parseDirectorChatModelSelection(raw: unknown): DirectorChatModelSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.provider === "wireline") {
    const tier = typeof value.tier === "string" ? value.tier : "auto";
    return TIERS.has(tier as WirelineDirectorTier)
      ? { provider: "wireline", tier: tier as WirelineDirectorTier }
      : null;
  }
  if (value.provider === "openrouter") {
    const modelId = typeof value.modelId === "string" ? value.modelId.trim() : "";
    return isOpenRouterModelId(modelId) ? { provider: "openrouter", modelId } : null;
  }
  return null;
}

export type ResolvedDirectorLlm = {
  provider: "wireline" | "openrouter";
  model: string;
  modelKind: "standard" | "deep" | "custom";
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

  const deep = selection.tier === "opus" || (selection.tier === "auto" && input.autoOpus === true);
  return {
    provider: "wireline",
    model: deep ? input.claudeOpus ?? OPENAI_STRUCTURED_PRIMARY_MODEL : input.claudeSonnet ?? OPENAI_STRUCTURED_PRIMARY_MODEL,
    modelKind: deep ? "deep" : "standard",
    modelLabel: "GPT-5.5",
    deepThink: deep,
    maxTokens: input.longDeliverable ? 5000 : 2500,
  };
}

export function isOpenRouterModelId(id: string): boolean {
  if (!id || id.length > 160 || id.includes("..") || /\s/.test(id)) return false;
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
}
