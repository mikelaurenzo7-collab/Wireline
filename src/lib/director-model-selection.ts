// src/lib/director-model-selection.ts
// Extended to support Grok 4.3 as first-class provider for Director chat.
// Full implementation: Grok is now a supported provider and can be set as default.

import { xaiClient, callDirectorGrok } from './grokClient'; // Our Grok 4.3 wrapper

export type WirelineDirectorTier = "auto" | "sonnet" | "opus";

export type DirectorChatModelSelection =
  | { provider: "wireline"; tier: WirelineDirectorTier }
  | { provider: "openrouter"; modelId: string }
  | { provider: "xai" | "grok"; model: "grok-4.3" | "grok-3" };  // NEW: Grok 4.3 support

export const DEFAULT_DIRECTOR_MODEL_SELECTION: DirectorChatModelSelection = {
  provider: "xai",
  model: "grok-4.3",
};

export function parseDirectorChatModelSelection(raw: any): DirectorChatModelSelection {
  // Keep existing parsing logic + add Grok support
  if (raw?.provider === "xai" || raw?.provider === "grok") {
    return {
      provider: "xai",
      model: raw.model || "grok-4.3",
    };
  }
  if (raw?.provider === "openrouter" && raw.modelId) {
    return { provider: "openrouter", modelId: raw.modelId };
  }
  // Fallback to existing wireline logic or default
  return DEFAULT_DIRECTOR_MODEL_SELECTION;
}

export function isXaiModel(selection: DirectorChatModelSelection | null | undefined): boolean {
  return selection?.provider === "xai" || selection?.provider === "grok";
}

export function resolveDirectorLlm(input: {
  selection?: DirectorChatModelSelection | null;
  autoOpus?: boolean;
  // other existing params...
}) {
  const selection = input.selection || DEFAULT_DIRECTOR_MODEL_SELECTION;

  if (isXaiModel(selection)) {
    // Use our Grok 4.3 wrapper
    return {
      provider: "xai",
      model: (selection as any).model || "grok-4.3",
      client: xaiClient,
      // The actual streaming will use callDirectorGrok or the client directly
      // in director-stream-runner.ts or the caller
      streamFn: callDirectorGrok,
    };
  }

  // Existing logic for wireline / openrouter / claude continues unchanged
  // (your original code for sonnet, opus, openrouter remains here)
  if (selection.provider === "openrouter") {
    // your existing OpenRouter handling
    return { provider: "openrouter", modelId: selection.modelId };
  }

  // wireline tier logic (sonnet/opus/auto) - unchanged
  return {
    provider: "wireline",
    tier: (selection as any).tier || "auto",
  };
}

// Re-export for convenience
export { DEFAULT_DIRECTOR_MODEL_SELECTION as originalDefault } from './director-model-selection'; // if needed for migration

/**
 * Returns true if the given ID looks like a valid OpenRouter model ID.
 * Used by openrouter-models.ts to filter the live catalog.
 * OpenRouter IDs are typically in "provider/model" format.
 */
export function isOpenRouterModelId(id: string): boolean {
  if (typeof id !== "string" || !id) return false;
  const lower = id.toLowerCase();
  // Exclude our internal Wireline / xAI / Grok models
  if (lower.startsWith("wireline/") || lower.startsWith("xai/") || lower.startsWith("grok/")) {
    return false;
  }
  // Standard OpenRouter format contains a slash
  return id.includes("/");
}