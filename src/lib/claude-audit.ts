/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are vendor-defined JSON envelopes. */
/**
 * Runtime audit capture.
 *
 * Every managed model call pushes normalized usage metadata into the active
 * AsyncLocalStorage context. OpenAI is the managed primary; Gemini is the
 * automatic fallback; OpenRouter is explicit user choice only.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_MODEL, MODEL_PRICING, OPENAI_MODELS } from "./claude-models";

export interface RuntimeCallMeta {
  model: string;
  provider: "openai" | "openrouter" | "google";
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  latency_ms: number;
}

/** @deprecated Historical type alias retained while imports are consolidated. */
export type ClaudeCallMeta = RuntimeCallMeta;

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
  return new Promise((resolve, reject) => {
    auditCtx.run(ctx, async () => {
      try {
        resolve({ result: await fn(), records: ctx.records });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function createAuditContext(): AuditContext {
  return { records: [] };
}

export function runInAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return auditCtx.run(ctx, fn);
}

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
  model: string = DEFAULT_MODEL,
): number {
  const pricing = pricingFor(model);
  const total =
    (usage.input_tokens || 0) * pricing.input +
    (usage.output_tokens || 0) * pricing.output +
    (usage.cache_read_input_tokens || 0) * pricing.cacheRead +
    (usage.cache_creation_input_tokens || 0) * pricing.cacheWrite;
  return total / 1_000_000;
}

export interface CostBreakdown {
  model: string;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  savingsVsPrimary: number;
  /** @deprecated Legacy field name retained for dashboards. */
  savingsVsOpus: number;
}

export function estimateCostDetailed(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
  model: string = DEFAULT_MODEL,
): CostBreakdown {
  const pricing = pricingFor(model);
  const primaryPricing = pricingFor(DEFAULT_MODEL);
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;

  const inputCost = (inputTokens * pricing.input) / 1_000_000;
  const outputCost = (outputTokens * pricing.output) / 1_000_000;
  const cacheReadCost = (cacheReadTokens * pricing.cacheRead) / 1_000_000;
  const cacheWriteCost = (cacheWriteTokens * pricing.cacheWrite) / 1_000_000;
  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;
  const primaryTotal =
    (inputTokens * primaryPricing.input +
      outputTokens * primaryPricing.output +
      cacheReadTokens * primaryPricing.cacheRead +
      cacheWriteTokens * primaryPricing.cacheWrite) /
    1_000_000;
  const savingsVsPrimary = primaryTotal - totalCost;

  return {
    model,
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost,
    savingsVsPrimary,
    savingsVsOpus: savingsVsPrimary,
  };
}

function pushAuditRecord(record: RuntimeCallMeta): void {
  auditCtx.getStore()?.records.push(record);
}

function providerForModel(model: string): RuntimeCallMeta["provider"] {
  if (/^gpt-/i.test(model)) return "openai";
  if (model.toLowerCase().includes("gemini")) return "google";
  return "openrouter";
}

/** Records normalized OpenAI or Gemini-compatible usage from the runtime adapter. */
export function recordUsage(model: string, response: { usage?: any }, latencyMs: number) {
  pushAuditRecord({
    model,
    provider: providerForModel(model),
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
  const record: RuntimeCallMeta = {
    model,
    provider: "google",
    input_tokens: usage?.promptTokenCount ?? 0,
    output_tokens: usage?.candidatesTokenCount ?? 0,
    cache_read_tokens: 0,
    cache_create_tokens: 0,
    latency_ms: latencyMs,
  };
  pushAuditRecord(record);
  return record;
}

export function recordOpenRouterUsage(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
  latencyMs: number,
) {
  pushAuditRecord({
    model,
    provider: "openrouter",
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: 0,
    cache_create_tokens: 0,
    latency_ms: latencyMs,
  });
}
