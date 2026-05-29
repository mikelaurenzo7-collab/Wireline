/* eslint-disable @typescript-eslint/no-explicit-any -- Anthropic SDK response shapes use any. */
/**
 * Claude Audit Capture
 * ---------------------------------------------------------------------------
 * Every Claude API round trip pushes its meta into the active
 * AsyncLocalStorage context (if any). Endpoints wrap their work with
 * `withAuditCapture` to collect the records, then flush them to
 * wireline_audit_log. Zero-cost when no context is active.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { CLAUDE_MODELS, DEFAULT_MODEL, MODEL_PRICING } from "./claude-models";

export interface ClaudeCallMeta {
  model: string;
  provider: "anthropic";
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  latency_ms: number;
}

export interface AuditContext {
  records: ClaudeCallMeta[];
}
const auditCtx = new AsyncLocalStorage<AuditContext>();

/** Capture all Claude usage performed inside `fn`, then return it. */
export async function withAuditCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; records: ClaudeCallMeta[] }> {
  const ctx: AuditContext = { records: [] };
  return new Promise((resolve, reject) => {
    auditCtx.run(ctx, async () => {
      try {
        const result = await fn();
        resolve({ result, records: ctx.records });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Lower-level helpers for express middleware use. The middleware
 *  creates a context BEFORE the route handler runs and flushes the
 *  records on `res.on('finish')`. */
export function createAuditContext(): AuditContext {
  return { records: [] };
}
export function runInAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return auditCtx.run(ctx, fn);
}

/** Estimate cost in USD from Anthropic usage. Uses accurate model-specific pricing.
 *  Supports Haiku, Sonnet, and Opus with their respective rates.
 *  Provides cost breakdown for monitoring and optimization. */
export function estimateCost(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
  model: string = DEFAULT_MODEL,
): number {
  const pricing =
    MODEL_PRICING[model as keyof typeof MODEL_PRICING] ?? MODEL_PRICING[CLAUDE_MODELS.OPUS];
  const total =
    (usage.input_tokens || 0) * pricing.input +
    (usage.output_tokens || 0) * pricing.output +
    (usage.cache_read_input_tokens || 0) * pricing.cacheRead +
    (usage.cache_creation_input_tokens || 0) * pricing.cacheWrite;
  return total / 1_000_000;
}

/** Cost breakdown detail for monitoring and dashboards */
export interface CostBreakdown {
  model: string;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  savingsVsOpus: number; // Cost savings compared to using Opus for this request
}

/** Get detailed cost breakdown for monitoring and optimization insights */
export function estimateCostDetailed(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
  model: string = DEFAULT_MODEL,
): CostBreakdown {
  const pricing =
    MODEL_PRICING[model as keyof typeof MODEL_PRICING] ?? MODEL_PRICING[CLAUDE_MODELS.OPUS];
  const opusPricing = MODEL_PRICING[CLAUDE_MODELS.OPUS];

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;

  const inputCost = (inputTokens * pricing.input) / 1_000_000;
  const outputCost = (outputTokens * pricing.output) / 1_000_000;
  const cacheReadCost = (cacheReadTokens * pricing.cacheRead) / 1_000_000;
  const cacheWriteCost = (cacheWriteTokens * pricing.cacheWrite) / 1_000_000;
  const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

  // Calculate what this would have cost on Opus
  const opusInputCost = (inputTokens * opusPricing.input) / 1_000_000;
  const opusOutputCost = (outputTokens * opusPricing.output) / 1_000_000;
  const opusCacheReadCost = (cacheReadTokens * opusPricing.cacheRead) / 1_000_000;
  const opusCacheWriteCost = (cacheWriteTokens * opusPricing.cacheWrite) / 1_000_000;
  const opusTotalCost = opusInputCost + opusOutputCost + opusCacheReadCost + opusCacheWriteCost;

  return {
    model,
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost,
    savingsVsOpus: opusTotalCost - totalCost,
  };
}

export function recordUsage(model: string, response: { usage: any }, latencyMs: number) {
  const ctx = auditCtx.getStore();
  if (!ctx) return;
  ctx.records.push({
    model,
    provider: "anthropic",
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    cache_create_tokens: response.usage?.cache_creation_input_tokens ?? 0,
    latency_ms: latencyMs,
  });
}
