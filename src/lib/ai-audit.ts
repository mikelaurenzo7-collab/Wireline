/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_MODEL, pricingForModel } from "./ai-models";
import { normalizeProviderReportedCostUsd } from "./ai-provider-cost";
import { normalizeUsageTokenCount, saturatingUsageTokenSum } from "./ai-usage";

export interface RuntimeCallMeta {
  model: string;
  provider: string;
  /** Validated and numeric(12,6)-quantized request charge supplied by the transport. */
  actual_cost_usd?: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  latency_ms: number;
}
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /**
   * Reasoning tokens on thinking models (gemini-2.5/3.x). Google bills them at
   * the output rate but reports them OUTSIDE candidatesTokenCount — omitting
   * them under-meters every thinking-model call by the full reasoning budget.
   */
  thoughtsTokenCount?: number;
  /** Context-cache reads, billed at the cache-read rate. */
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}
export interface AuditContext {
  records: RuntimeCallMeta[];
  /** Provider calls that failed after submission and may still be billable. */
  ambiguousProviderAttempts: number;
}
const auditCtx = new AsyncLocalStorage<AuditContext>();

export async function withAuditCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; records: RuntimeCallMeta[] }> {
  const ctx: AuditContext = { records: [], ambiguousProviderAttempts: 0 };
  return new Promise((resolve, reject) =>
    auditCtx.run(ctx, async () => {
      try {
        resolve({ result: await fn(), records: ctx.records });
      } catch (error) {
        reject(error);
      }
    }),
  );
}
export const createAuditContext = (): AuditContext => ({
  records: [],
  ambiguousProviderAttempts: 0,
});
export const runInAuditContext = <T>(ctx: AuditContext, fn: () => T): T => auditCtx.run(ctx, fn);
export function estimateCost(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
  model = DEFAULT_MODEL,
): number {
  const input = usage.input_tokens || 0;
  const read = usage.cache_read_input_tokens || 0;
  const write = usage.cache_creation_input_tokens || 0;
  const p = pricingForModel(model, input + read + write);
  return (
    (input * p.input +
      (usage.output_tokens || 0) * p.output +
      read * p.cacheRead +
      write * p.cacheWrite) /
    1_000_000
  );
}

export type RuntimeCallCostBasis = "provider_reported" | "catalog_estimate";

/**
 * Resolve one runtime record to a ledger-safe charge. Every persistence and
 * settlement path uses this decision so a malformed provider value cannot
 * acquire a truthful-looking `provider_reported` label in one path while a
 * different path falls back to the catalog.
 */
export function resolveRuntimeCallCost(record: RuntimeCallMeta): {
  costUsd: number;
  costBasis: RuntimeCallCostBasis;
} {
  const reported = normalizeProviderReportedCostUsd(record.actual_cost_usd);
  if (reported !== undefined) return { costUsd: reported, costBasis: "provider_reported" };
  const inputTokens = normalizeUsageTokenCount(record.input_tokens);
  const outputTokens = normalizeUsageTokenCount(record.output_tokens);
  const cacheReadTokens = normalizeUsageTokenCount(record.cache_read_tokens);
  const cacheCreateTokens = normalizeUsageTokenCount(record.cache_create_tokens);
  return {
    costUsd: estimateCost(
      {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheReadTokens,
        cache_creation_input_tokens: cacheCreateTokens,
      },
      record.model,
    ),
    costBasis: "catalog_estimate",
  };
}
export interface CostBreakdown {
  model: string;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  savingsVsPrimary: number;
}
export function estimateCostDetailed(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
  model = DEFAULT_MODEL,
): CostBreakdown {
  const input = usage.input_tokens || 0,
    output = usage.output_tokens || 0,
    read = usage.cache_read_input_tokens || 0,
    write = usage.cache_creation_input_tokens || 0;
  const totalInput = input + read + write;
  const p = pricingForModel(model, totalInput);
  const primary = pricingForModel(DEFAULT_MODEL, totalInput);
  const inputCost = (input * p.input) / 1_000_000,
    outputCost = (output * p.output) / 1_000_000,
    cacheReadCost = (read * p.cacheRead) / 1_000_000,
    cacheWriteCost = (write * p.cacheWrite) / 1_000_000;
  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
  return {
    model,
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost,
    savingsVsPrimary:
      (input * primary.input +
        output * primary.output +
        read * primary.cacheRead +
        write * primary.cacheWrite) /
        1_000_000 -
      totalCost,
  };
}
function push(record: RuntimeCallMeta) {
  auditCtx.getStore()?.records.push(record);
}
export function recordAmbiguousProviderAttempt(): void {
  const context = auditCtx.getStore();
  if (context) context.ambiguousProviderAttempts += 1;
}
function providerFor(model: string): RuntimeCallMeta["provider"] {
  const normalized = model.trim().toLowerCase();
  // Gateway responses use provider/model ids. Keep the transport out of the
  // serving-provider field so fallback reports remain truthful and comparable
  // with the same model called directly.
  if (normalized.startsWith("openai/") || normalized.startsWith("gpt-")) return "openai";
  if (normalized.startsWith("google/") || normalized.includes("gemini")) return "google";
  if (normalized.startsWith("anthropic/") || normalized.startsWith("claude-")) return "anthropic";
  return "gateway";
}
export function recordUsage(
  model: string,
  response: {
    model?: string;
    inference_provider?: unknown;
    actual_cost_usd?: unknown;
    usage?: any;
  },
  latencyMs: number,
) {
  // Attribute cost to the model that actually served the turn. On provider
  // failover the runtime returns a different model than requested, so pricing
  // and provider attribution must follow the response, not the request.
  const served = typeof response.model === "string" && response.model ? response.model : model;
  const reportedProvider =
    typeof response.inference_provider === "string"
      ? response.inference_provider.trim().toLowerCase()
      : "";
  const inferenceProvider = /^[a-z0-9][a-z0-9._:/-]{0,99}$/.test(reportedProvider)
    ? reportedProvider
    : providerFor(served);
  const actualCostUsd = normalizeProviderReportedCostUsd(response.actual_cost_usd);
  push({
    model: served,
    provider: inferenceProvider,
    ...(typeof actualCostUsd === "number" ? { actual_cost_usd: actualCostUsd } : {}),
    input_tokens: normalizeUsageTokenCount(
      response.usage?.input_tokens ?? response.usage?.prompt_tokens,
    ),
    output_tokens: normalizeUsageTokenCount(
      response.usage?.output_tokens ?? response.usage?.completion_tokens,
    ),
    cache_read_tokens: normalizeUsageTokenCount(response.usage?.cache_read_input_tokens),
    cache_create_tokens: normalizeUsageTokenCount(response.usage?.cache_creation_input_tokens),
    latency_ms: latencyMs,
  });
}
export function recordGeminiUsage(
  model: string,
  usage: GeminiUsageMetadata | undefined,
  latencyMs: number,
): RuntimeCallMeta {
  // promptTokenCount INCLUDES cachedContentTokenCount, so subtract the cached
  // share out of the full-price input bucket rather than double-counting it.
  const promptTokens = normalizeUsageTokenCount(usage?.promptTokenCount);
  const cachedTokens = Math.min(
    promptTokens,
    normalizeUsageTokenCount(usage?.cachedContentTokenCount),
  );
  const candidatesTokens = normalizeUsageTokenCount(usage?.candidatesTokenCount);
  const thoughtsTokens = normalizeUsageTokenCount(usage?.thoughtsTokenCount);
  const record = {
    model,
    provider: "google" as const,
    input_tokens: Math.max(0, promptTokens - cachedTokens),
    output_tokens: saturatingUsageTokenSum(candidatesTokens, thoughtsTokens),
    cache_read_tokens: cachedTokens,
    cache_create_tokens: 0,
    latency_ms: latencyMs,
  };
  push(record);
  return record;
}
