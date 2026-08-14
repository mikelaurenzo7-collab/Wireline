/**
 * Governed structured-reasoning provider policy.
 *
 * Wireline runs one managed structured runtime with an ordered continuity
 * chain. OpenAI is the launch default and stays the default here. This module
 * owns two decisions that used to be scattered through `ai-client.ts`:
 *
 * 1. **Which providers are eligible** for a given process, based on configured
 *    credentials plus explicit operator opt-outs.
 * 2. **What order they are attempted in**, including promoting an operator's
 *    preferred provider to the front of the chain without discarding the rest
 *    of the chain as continuity.
 *
 * Keeping this separate from the transport in `ai-client.ts` means the chain is
 * testable without network access, and a provider's position is a reviewable
 * policy statement rather than the order someone happened to write `if` blocks.
 *
 * ## xAI
 *
 * xAI is a real, supported lane on `https://api.x.ai/v1/responses`, not a
 * decorative entry. Historically it required BOTH `XAI_API_KEY` and
 * `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK=true`, so a configured key did
 * nothing on its own and the credential sat idle. That double gate is gone:
 * a configured key now earns xAI a place at the tail of the chain, where it is
 * reached only after OpenAI, Gemini, and the Gateway have each failed. Reaching
 * a working provider is strictly better than returning 503, so this is a
 * continuity improvement, not a default change — the managed default is still
 * OpenAI and xAI never displaces it unless an operator explicitly asks.
 *
 * `WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK` is now tri-state and remains the
 * escape hatch: unset means "on when a key is configured", `false` disables the
 * lane outright, `true` is the historical explicit opt-in and still works.
 */

export type ReasoningProviderId = "openai" | "gemini" | "gateway" | "xai";

export type ReasoningProviderOption = {
  id: ReasoningProviderId;
  /** Operator-facing label. Never rendered to tenants. */
  label: string;
  /** Credentials that make this lane eligible. */
  envKeys: readonly string[];
  note: string;
};

/**
 * Default attempt order. Every entry after the first is continuity: it is
 * reached only when the providers before it have failed for this request.
 */
export const REASONING_PROVIDER_ORDER: readonly ReasoningProviderId[] = [
  "openai",
  "gemini",
  "gateway",
  "xai",
] as const;

export const DEFAULT_REASONING_PROVIDER: ReasoningProviderId = "openai";

export const REASONING_PROVIDER_CATALOG: readonly ReasoningProviderOption[] = [
  {
    id: "openai",
    label: "OpenAI",
    envKeys: ["OPENAI_API_KEY"],
    note: "Managed launch default for structured reasoning.",
  },
  {
    id: "gemini",
    label: "Gemini",
    envKeys: ["GEMINI_API_KEY"],
    note: "First automatic continuity fallback.",
  },
  {
    id: "gateway",
    label: "AI Gateway",
    envKeys: ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"],
    note: "Governed multi-model continuity route.",
  },
  {
    id: "xai",
    label: "xAI Grok",
    envKeys: ["XAI_API_KEY"],
    note: "Active continuity lane whenever XAI_API_KEY is configured. Promotable to primary via WIRELINE_STRUCTURED_PRIMARY_PROVIDER.",
  },
] as const;

export function normalizeReasoningProvider(value: unknown): ReasoningProviderId | null {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!candidate) return null;
  // Accept the vendor-flavored aliases operators actually type.
  const alias =
    candidate === "grok"
      ? "xai"
      : candidate === "google"
        ? "gemini"
        : candidate === "ai-gateway" || candidate === "vercel"
          ? "gateway"
          : candidate;
  return REASONING_PROVIDER_ORDER.includes(alias as ReasoningProviderId)
    ? (alias as ReasoningProviderId)
    : null;
}

/**
 * Tri-state opt-out for the xAI lane.
 *
 * - unset  → enabled when `XAI_API_KEY` is configured (current policy)
 * - "false" → disabled even with a key present (escape hatch)
 * - "true"  → historical explicit opt-in; still honored
 */
export function isXAIStructuredLaneEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

/**
 * The operator-selected primary lane. Invalid or unset values resolve to the
 * managed OpenAI default, so a typo can never silently move production traffic
 * onto a different vendor.
 */
export function resolveReasoningPreference(
  env: NodeJS.ProcessEnv = process.env,
): ReasoningProviderId {
  return (
    normalizeReasoningProvider(env.WIRELINE_STRUCTURED_PRIMARY_PROVIDER) ??
    DEFAULT_REASONING_PROVIDER
  );
}

/**
 * Order the eligible providers for one request.
 *
 * The preferred provider is promoted to the front when it is actually
 * available; every other provider keeps its default relative order behind it so
 * the chain still degrades through the managed lanes. A preference naming an
 * unavailable provider is ignored rather than honored into a dead end.
 */
export function orderReasoningProviders(
  available: readonly ReasoningProviderId[],
  preference: ReasoningProviderId = DEFAULT_REASONING_PROVIDER,
): ReasoningProviderId[] {
  const eligible = REASONING_PROVIDER_ORDER.filter((id) => available.includes(id));
  if (preference === DEFAULT_REASONING_PROVIDER || !eligible.includes(preference)) {
    return eligible;
  }
  return [preference, ...eligible.filter((id) => id !== preference)];
}

/** Catalog lookup for operator-facing status surfaces. */
export function reasoningProviderLabel(id: ReasoningProviderId): string {
  return REASONING_PROVIDER_CATALOG.find((option) => option.id === id)?.label ?? id;
}
