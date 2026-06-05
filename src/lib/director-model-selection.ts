/**
 * Director chat model selection — Wireline-managed Claude tiers or tenant-
 * routed OpenRouter models (company API key, per-user preference).
 */

export type WirelineDirectorTier = "auto" | "sonnet" | "opus";

export type DirectorChatModelSelection =
  | { provider: "wireline"; tier: WirelineDirectorTier }
  | { provider: "openrouter"; modelId: string };

export const DEFAULT_DIRECTOR_MODEL_SELECTION: DirectorChatModelSelection = {
  provider: "wireline",
  tier: "auto",
};

const OPENROUTER_MODEL_ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/i;

export function isOpenRouterModelId(modelId: string): boolean {
  return OPENROUTER_MODEL_ID.test(modelId.trim());
}

export function parseDirectorChatModelSelection(raw: unknown): DirectorChatModelSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.provider === "wireline") {
    const tier = o.tier;
    if (tier === "auto" || tier === "sonnet" || tier === "opus") {
      return { provider: "wireline", tier };
    }
    return null;
  }
  if (o.provider === "openrouter" && typeof o.modelId === "string") {
    const modelId = o.modelId.trim();
    if (!isOpenRouterModelId(modelId)) return null;
    return { provider: "openrouter", modelId };
  }
  return null;
}

export interface ResolvedDirectorLlm {
  provider: "wireline" | "openrouter";
  /** Provider-native model id passed to the API. */
  model: string;
  deepThink: boolean;
  maxTokens: number;
  /** UI + metadata — sonnet/opus/custom */
  modelKind: "sonnet" | "opus" | "custom";
  modelLabel: string;
  openRouterModelId?: string;
}

export function resolveDirectorLlm(input: {
  selection?: DirectorChatModelSelection | null;
  /** Fleet auto-deep (ignored when user pinned sonnet/openrouter). */
  autoDeep?: boolean;
  claudeSonnet: string;
  claudeOpus: string;
  modelLabelForOpenRouter?: (id: string) => string;
}): ResolvedDirectorLlm {
  const selection = input.selection ?? DEFAULT_DIRECTOR_MODEL_SELECTION;
  const labelFor = input.modelLabelForOpenRouter ?? ((id: string) => id);

  if (selection.provider === "openrouter") {
    return {
      provider: "openrouter",
      model: selection.modelId,
      deepThink: false,
      maxTokens: 4096,
      modelKind: "custom",
      modelLabel: labelFor(selection.modelId),
      openRouterModelId: selection.modelId,
    };
  }

  const tier = selection.tier;
  if (tier === "sonnet") {
    return {
      provider: "wireline",
      model: input.claudeSonnet,
      deepThink: false,
      maxTokens: 2800,
      modelKind: "sonnet",
      modelLabel: "Sonnet",
    };
  }
  if (tier === "opus") {
    return {
      provider: "wireline",
      model: input.claudeOpus,
      deepThink: true,
      maxTokens: 4000,
      modelKind: "opus",
      modelLabel: "Opus",
    };
  }

  const deep = input.autoDeep === true;
  return {
    provider: "wireline",
    model: deep ? input.claudeOpus : input.claudeSonnet,
    deepThink: deep,
    maxTokens: deep ? 4000 : 2800,
    modelKind: deep ? "opus" : "sonnet",
    modelLabel: deep ? "Opus" : "Sonnet",
  };
}
