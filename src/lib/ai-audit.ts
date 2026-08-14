/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_MODEL, isXAIModelId, pricingForModel } from "./ai-models";

export interface RuntimeCallMeta {
  model: string;
  provider: "xai" | "openai" | "google" | "gateway";
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
}
const auditCtx = new AsyncLocalStorage<AuditContext>();

export async function withAuditCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; records: RuntimeCallMeta[] }> {
  const ctx: AuditContext = { records: [] };
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
export const createAuditContext = (): AuditContext => ({ records: [] });
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
function providerFor(model: string): RuntimeCallMeta["provider"] {
  if (/^gpt-/i.test(model)) return "openai";
  if (model.toLowerCase().includes("gemini")) return "google";
  // Bare grok ids come from the explicitly enabled direct xAI runtime;
  // provider/model form ("xai/grok-4.5") comes back from AI Gateway.
  if (isXAIModelId(model) && !model.includes("/")) return "xai";
  return "gateway";
}
export function recordUsage(
  model: string,
  response: { model?: string; usage?: any },
  latencyMs: number,
) {
  // Attribute cost to the model that actually served the turn. On provider
  // failover the runtime returns a different model than requested, so pricing
  // and provider attribution must follow the response, not the request.
  const served = typeof response.model === "string" && response.model ? response.model : model;
  push({
    model: served,
    provider: providerFor(served),
    input_tokens: response.usage?.input_tokens ?? response.usage?.prompt_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? response.usage?.completion_tokens ?? 0,
    cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    cache_create_tokens: response.usage?.cache_creation_input_tokens ?? 0,
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
  const cachedTokens = Math.max(0, usage?.cachedContentTokenCount ?? 0);
  const promptTokens = Math.max(0, usage?.promptTokenCount ?? 0);
  const record = {
    model,
    provider: "google" as const,
    input_tokens: Math.max(0, promptTokens - cachedTokens),
    output_tokens: (usage?.candidatesTokenCount ?? 0) + Math.max(0, usage?.thoughtsTokenCount ?? 0),
    cache_read_tokens: cachedTokens,
    cache_create_tokens: 0,
    latency_ms: latencyMs,
  };
  push(record);
  return record;
}
