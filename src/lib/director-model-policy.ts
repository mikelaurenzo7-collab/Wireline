/**
 * Director chat model policy — allowlist, validation, and preference sanitization.
 */
import {
  DEFAULT_DIRECTOR_MODEL_SELECTION,
  parseDirectorChatModelSelection,
  type DirectorChatModelSelection,
} from "./director-model-selection";
import { isOpenRouterConfigured, listOpenRouterModelsForDirector } from "./openrouter-models";
import { getSubscriptionPlanId, openRouterAllowedForPlanId } from "./plan-entitlements";

export type DirectorModelValidationResult =
  | { ok: true; selection: DirectorChatModelSelection }
  | { ok: false; error: string; status: number };

/** Allowed OpenRouter model ids (curated + cached catalog merge). */
export async function getAllowedOpenRouterModelIds(): Promise<Set<string>> {
  const { catalog } = await listOpenRouterModelsForDirector();
  return new Set(catalog.map((m) => m.id));
}

/** @deprecated Allowlist follows OpenRouter catalog cache; kept for tests. */
export function clearDirectorModelAllowlistCache(): void {
  /* no-op — catalog TTL lives in openrouter-models */
}

export async function validateDirectorChatModelSelection(
  selection: DirectorChatModelSelection,
  options?: { planId?: string | null },
): Promise<DirectorModelValidationResult> {
  if (selection.provider === "wireline") {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return {
        ok: false,
        error: "Anthropic is not configured on this workspace",
        status: 503,
      };
    }
    return { ok: true, selection };
  }

  if (!isOpenRouterConfigured()) {
    return {
      ok: false,
      error: "OpenRouter is not configured on this workspace",
      status: 503,
    };
  }

  if (!openRouterAllowedForPlanId(options?.planId)) {
    return {
      ok: false,
      error: "OpenRouter models require a Pro plan or higher",
      status: 403,
    };
  }

  const allowed = await getAllowedOpenRouterModelIds();
  if (!allowed.has(selection.modelId)) {
    return {
      ok: false,
      error: "Model is not available on this workspace",
      status: 400,
    };
  }

  return { ok: true, selection };
}

export async function sanitizeDirectorChatModelPreference(
  selection: DirectorChatModelSelection,
  options?: { planId?: string | null },
): Promise<DirectorChatModelSelection> {
  if (selection.provider === "wireline") return selection;
  if (!isOpenRouterConfigured() || !openRouterAllowedForPlanId(options?.planId)) {
    return DEFAULT_DIRECTOR_MODEL_SELECTION;
  }
  const allowed = await getAllowedOpenRouterModelIds();
  if (allowed.has(selection.modelId)) return selection;
  return DEFAULT_DIRECTOR_MODEL_SELECTION;
}

/** Parse request body or DB preference; always returns an allowlisted selection. */
export async function resolveDirectorModelSelection(
  userId: string,
  body: Record<string, unknown>,
  loadPreference: (id: string) => Promise<DirectorChatModelSelection>,
): Promise<
  { ok: true; selection: DirectorChatModelSelection } | { ok: false; error: string; status: number }
> {
  const planId = await getSubscriptionPlanId(userId);
  const planOpts = { planId };

  const fromBody = parseDirectorChatModelSelection(body.modelSelection);
  if (fromBody) {
    return validateDirectorChatModelSelection(fromBody, planOpts);
  }

  const stored = await loadPreference(userId);
  const sanitized = await sanitizeDirectorChatModelPreference(stored, planOpts);
  return validateDirectorChatModelSelection(sanitized, planOpts);
}

export function directorLlmConfigured(selection: DirectorChatModelSelection): boolean {
  if (selection.provider === "openrouter") return isOpenRouterConfigured();
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** SSE / UI model tier — distinct from legacy sonnet|opus metadata field. */
export function directorStreamMetaModel(
  ctx: Pick<
    { modelKind: "sonnet" | "opus" | "custom"; deepThink: boolean },
    "modelKind" | "deepThink"
  >,
): { model: "sonnet" | "opus" | "custom"; deep: boolean } {
  if (ctx.modelKind === "custom") {
    return { model: "custom", deep: false };
  }
  return {
    model: ctx.modelKind,
    deep: ctx.deepThink,
  };
}
