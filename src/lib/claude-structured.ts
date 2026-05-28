/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * Claude Structured Output & Completion Helpers
 * ---------------------------------------------------------------------------
 * Core primitives for getting structured JSON and plain text from Claude.
 * Uses tool-use for structured extraction and plain messages for free-form
 * generation. Includes a resilient completion wrapper with OpenAI fallback.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  selectModelForTask,
  DEFAULT_MODEL,
  OPENAI_MODELS,
  type TaskComplexity,
} from "./claude-models";
import { recordUsage } from "./claude-audit";
import { getClient } from "./claude-client";

/* ────────────────────────────────────────────────────────────────────────
 *  Tool-call helpers — getting structured JSON out of Claude.
 *  We use tool-use rather than `output_config.format` because tool descriptions
 *  steer Claude better for these structured-extraction workloads.
 * ──────────────────────────────────────────────────────────────────── */

export type ToolSchema = Anthropic.Tool;

interface StructuredOptions {
  system: string;
  user: string;
  tool: ToolSchema;
  /** Adds adaptive thinking + xhigh effort for tough analyses. */
  deepThink?: boolean;
  /** Marks `system` as the cacheable prefix (wraps it in a single
   *  cache_control: ephemeral block). Recommended when `system` is large and
   *  reused byte-for-byte across calls (e.g. an agent's persona + knowledge).
   *
   *  Caveats — Anthropic caching is a prefix match, so the marker only pays off
   *  when BOTH hold:
   *   - the system block clears the model's minimum cacheable prefix
   *     (~4096 tokens on Opus-tier, ~2048 on Sonnet). Below that the marker is
   *     a silent no-op — no error, just cache_creation_input_tokens=0.
   *   - the prefix is byte-stable across calls. Keep per-request volatile data
   *     (transcripts, customer details, timestamps) in `user`, never in
   *     `system`; otherwise every call writes a fresh entry and none are read.
   *  Verify real hits via response.usage.cache_read_input_tokens (recorded in
   *  the audit log by recordUsage). */
  cacheSystem?: boolean;
  model?: string;
  /** Task complexity for automatic model tiering. Overrides model if specified.
   *  simple = Haiku (fast, cheap), medium = Sonnet (balanced), complex = Opus (deep) */
  complexity?: TaskComplexity;
  /** Hard ceiling on output tokens for this call (default 4096). */
  maxTokens?: number;
}

/**
 * Run a single tool-call and return the parsed input. The tool is `tool_choice`
 * forced so Claude must produce a structured payload.
 *
 * Cost optimization: Use complexity='simple' for classification/extraction
 * to save 60-80% on token costs vs Opus. Use 'complex' only for deep reasoning.
 */
export async function runStructured<T = any>(opts: StructuredOptions): Promise<T> {
  const client = getClient();
  // Select model based on complexity tier or explicit model override
  const model =
    opts.model ?? (opts.complexity ? selectModelForTask(opts.complexity) : DEFAULT_MODEL);

  const body: Anthropic.MessageCreateParams = {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.cacheSystem
      ? [
          {
            type: "text",
            text: opts.system,
            cache_control: { type: "ephemeral" },
          },
        ]
      : opts.system,
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.user }],
  };

  if (opts.deepThink) {
    // Verified against @anthropic-ai/sdk@^0.92 typings:
    //   - `ThinkingConfigAdaptive { type: 'adaptive' }` is a member of
    //     `ThinkingConfigParam`.
    //   - `OutputConfig.effort` accepts 'low'|'medium'|'high'|'xhigh'|'max'.
    // See node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts.
    body.thinking = { type: "adaptive" };
    body.output_config = { effort: "high" };
  }

  const t0 = Date.now();
  const response = await client.messages.create(body);
  recordUsage(model, response, Date.now() - t0);
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === opts.tool.name) {
      return block.input as T;
    }
  }
  throw new Error(
    `Claude returned no ${opts.tool.name} tool_use block (stop_reason=${response.stop_reason})`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Plain text completion — for free-form generation (drafts, emails).
 * ──────────────────────────────────────────────────────────────────── */

interface CompletionOptions {
  system: string;
  user: string;
  cacheSystem?: boolean;
  model?: string;
  /** Task complexity for automatic model tiering. Overrides model if specified.
   *  simple = Haiku (fast, cheap), medium = Sonnet (balanced), complex = Opus (deep) */
  complexity?: TaskComplexity;
  maxTokens?: number;
  /** When true, asks Claude for a structured response by example, but returns plain text. */
  prefill?: undefined;
}

/**
 * Plain text completion — for free-form generation (drafts, emails).
 *
 * Cost optimization: Use complexity='simple' for short summaries or replies
 * to save 60-80% on token costs. Use 'complex' only for creative writing.
 */
export async function runCompletion(opts: CompletionOptions): Promise<{
  text: string;
  cacheRead: number;
  cacheCreate: number;
}> {
  const client = getClient();
  // Select model based on complexity tier or explicit model override
  const model =
    opts.model ?? (opts.complexity ? selectModelForTask(opts.complexity) : DEFAULT_MODEL);
  const t0 = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.cacheSystem
      ? [
          {
            type: "text",
            text: opts.system,
            cache_control: { type: "ephemeral" },
          },
        ]
      : opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  recordUsage(model, response, Date.now() - t0);
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return {
    text,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheCreate: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Resilient text-completion wrapper.
 *
 *   1. Try Claude (runCompletion above).
 *   2. On transient failure — 529 overloaded, 503 service unavailable,
 *      or a network/fetch error — retry once after a short jittered
 *      backoff. Most "Claude is down" reports are these 1-3 minute blips.
 *   3. On persistent failure AND if OpenAI is configured (OPENAI_API_KEY
 *      present), fall back to OpenAI GPT-4o. The text portion of the
 *      response is preserved; cache counters are zeroed because OpenAI
 *      doesn't expose Anthropic-style prompt caching.
 *   4. If OpenAI is also unavailable, re-throw the original Claude error
 *      so callers see the real failure (not a silent empty response).
 *
 * Tool-use (`runStructured`) is NOT covered — OpenAI's schema differs
 * enough that a clean swap risks bad payloads. Callers that need
 * structured output should treat structured failures as user-visible
 * errors and prompt a retry.
 *
 * Wire this into any caller where:
 *   - Plain text is enough (digests, summaries, briefs, descriptions)
 *   - The blast radius of a Claude outage is a real user-facing failure
 *
 * Leave callers on raw `runCompletion` when the output must be Claude-
 * specific (high-stakes negotiation, complex tool-chain reasoning).
 */
export async function runCompletionResilient(opts: CompletionOptions): Promise<{
  text: string;
  cacheRead: number;
  cacheCreate: number;
  provider: "claude" | "openai";
}> {
  const isTransient = (err: unknown): boolean => {
    const e = err as { status?: number; message?: string };
    if (e?.status === 529 || e?.status === 503 || e?.status === 502) return true;
    const msg = (e?.message ?? "").toLowerCase();
    return /overloaded|temporarily|fetch failed|econnreset|etimedout/.test(msg);
  };

  // Attempt 1 + 1 retry on transient errors.
  let claudeErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await runCompletion(opts);
      return { ...result, provider: "claude" };
    } catch (err) {
      claudeErr = err;
      if (!isTransient(err)) break;
      if (attempt === 0) {
        const jitter = 250 + Math.random() * 250;
        await new Promise((r) => setTimeout(r, jitter));
        continue;
      }
    }
  }

  // OpenAI fallback path — only run if explicitly available.
  if (process.env.OPENAI_API_KEY) {
    try {
      const prompt = `${opts.system}\n\n${opts.user}`;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_FALLBACK_MODEL || OPENAI_MODELS.GPT_4O,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI fallback failed (${response.status})`);
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content || "";
      try {
        const { log } = await import("./server-context");
        log.warn("Claude unavailable, served via OpenAI fallback", {
          claude_error: (claudeErr as { message?: string })?.message,
        });
      } catch {
        /* ignore */
      }
      return { text, cacheRead: 0, cacheCreate: 0, provider: "openai" };
    } catch {
      // OpenAI also failed — throw the original Claude error so the
      // caller's error handling sees the actual root cause, not the
      // secondary symptom.
    }
  }

  throw claudeErr;
}
