import { OPENAI_STRUCTURED_PRIMARY_MODEL } from "./ai-models";

export type WirelineDirectorTier = "auto" | "standard" | "deep";
export type DirectorChatModelSelection =
  | { provider: "wireline"; tier: WirelineDirectorTier }
  | { provider: "openrouter"; modelId: string };

export const DEFAULT_DIRECTOR_OPENROUTER_MODEL =
  process.env.WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL?.trim() || "openai/gpt-4o";

export const DEFAULT_DIRECTOR_MODEL_SELECTION: DirectorChatModelSelection = {
  provider: "wireline",
  tier: "standard",
};

const TIERS = new Set<WirelineDirectorTier>(["auto", "standard", "deep"]);

export function parseDirectorChatModelSelection(raw: unknown): DirectorChatModelSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.provider === "wireline") {
    const legacyTier = typeof value.tier === "string" ? value.tier : "auto";
    const tier = legacyTier === "sonnet" ? "standard" : legacyTier === "opus" ? "deep" : legacyTier;
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
  autoDeep?: boolean;
  deepThink?: boolean;
  longDeliverable?: boolean;
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

  const deep = selection.tier === "deep" || (selection.tier === "auto" && input.autoDeep === true);
  return {
    provider: "wireline",
    model: OPENAI_STRUCTURED_PRIMARY_MODEL,
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
