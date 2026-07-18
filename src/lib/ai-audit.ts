/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_MODEL, MODEL_PRICING, OPENAI_MODELS } from "./ai-models";

export interface RuntimeCallMeta {
  model: string;
  provider: "xai" | "openai" | "openrouter" | "google";
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  latency_ms: number;
}
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
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
function pricingFor(model: string) {
  return MODEL_PRICING[model as keyof typeof MODEL_PRICING] ?? MODEL_PRICING[OPENAI_MODELS.GPT_5_5];
}
export function estimateCost(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
  model = DEFAULT_MODEL,
): number {
  const p = pricingFor(model);
  return (
    ((usage.input_tokens || 0) * p.input +
      (usage.output_tokens || 0) * p.output +
      (usage.cache_read_input_tokens || 0) * p.cacheRead +
      (usage.cache_creation_input_tokens || 0) * p.cacheWrite) /
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
  const p = pricingFor(model);
  const primary = pricingFor(DEFAULT_MODEL);
  const input = usage.input_tokens || 0,
    output = usage.output_tokens || 0,
    read = usage.cache_read_input_tokens || 0,
    write = usage.cache_creation_input_tokens || 0;
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
  // provider/model form (e.g. "x-ai/grok-4.5") routes through OpenRouter; a bare
  // grok id (e.g. "grok-4.5") is the direct xAI runtime and is priced via
  // MODEL_PRICING, not the OpenRouter estimator.
  if (model.includes("/")) return "openrouter";
  if (/grok/i.test(model)) return "xai";
  return "openrouter";
}
export function recordUsage(model: string, response: { usage?: any }, latencyMs: number) {
  push({
    model,
    provider: providerFor(model),
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
  const record = {
    model,
    provider: "google" as const,
    input_tokens: usage?.promptTokenCount ?? 0,
    output_tokens: usage?.candidatesTokenCount ?? 0,
    cache_read_tokens: 0,
    cache_create_tokens: 0,
    latency_ms: latencyMs,
  };
  push(record);
  return record;
}
export function recordOpenRouterUsage(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
  latencyMs: number,
) {
  push({
    model,
    provider: "openrouter",
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: 0,
    cache_create_tokens: 0,
    latency_ms: latencyMs,
  });
}
