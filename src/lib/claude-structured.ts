import { DEFAULT_MODEL, OPENAI_MODELS, selectModelForTask, type TaskComplexity } from "./claude-models";
import { recordUsage } from "./claude-audit";
import { getClient } from "./claude-client";

export type ToolSchema = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type StructuredOptions = {
  system: string;
  user: string;
  tool: ToolSchema;
  deepThink?: boolean;
  cacheSystem?: boolean;
  model?: string;
  complexity?: TaskComplexity;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type StructuredResult<T> = { result: T; thinking?: string; thinkingDurationMs?: number };

export interface StreamCallbacks {
  onThinkingStart?: () => void;
  onThinkingChunk?: (text: string) => void;
  onThinkingEnd?: (fullThinking: string, durationMs: number) => void;
  onResult?: (result: any) => void;
  onError?: (error: Error) => void;
}

type CompletionOptions = {
  system: string;
  user: string;
  cacheSystem?: boolean;
  model?: string;
  complexity?: TaskComplexity;
  maxTokens?: number;
  prefill?: undefined;
};

function modelFor(opts: { model?: string; complexity?: TaskComplexity }) {
  return opts.model ?? (opts.complexity ? selectModelForTask(opts.complexity) : DEFAULT_MODEL);
}

function bodyFor(opts: StructuredOptions, model: string) {
  return {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.cacheSystem
      ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
      : opts.system,
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.user }],
  };
}

function resultFor<T>(response: any, toolName: string): T {
  const block = response.content?.find((item: any) => item.type === "tool_use" && item.name === toolName);
  if (!block) throw new Error(`AI runtime returned no ${toolName} structured result.`);
  return block.input as T;
}

export async function runStructured<T = any>(opts: StructuredOptions): Promise<T> {
  return (await runStructuredWithThinking<T>(opts)).result;
}

export async function runStructuredWithThinking<T = any>(opts: StructuredOptions): Promise<StructuredResult<T>> {
  const model = modelFor(opts);
  const startedAt = Date.now();
  const response = await getClient().messages.create(bodyFor(opts, model) as any);
  recordUsage(model, response, Date.now() - startedAt);
  return { result: resultFor<T>(response, opts.tool.name) };
}

export async function runStructuredStream<T = any>(opts: StructuredOptions, callbacks: StreamCallbacks): Promise<StructuredResult<T>> {
  const model = modelFor(opts);
  const startedAt = Date.now();
  try {
    callbacks.onThinkingStart?.();
    callbacks.onThinkingChunk?.("Preparing structured response…");
    const stream = getClient().messages.stream(bodyFor(opts, model) as any, { signal: opts.signal });
    for await (const _event of stream) {
      if (opts.signal?.aborted) throw new DOMException("Structured stream aborted", "AbortError");
    }
    const response = await stream.finalMessage();
    const elapsed = Date.now() - startedAt;
    recordUsage(model, response, elapsed);
    const result = resultFor<T>(response, opts.tool.name);
    callbacks.onThinkingEnd?.("Structured response ready.", elapsed);
    callbacks.onResult?.(result);
    return { result };
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function runCompletion(opts: CompletionOptions): Promise<{ text: string; cacheRead: number; cacheCreate: number }> {
  const model = modelFor(opts);
  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.cacheSystem
      ? [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }]
      : opts.system,
    messages: [{ role: "user", content: opts.user }],
  } as any);
  recordUsage(model, response, Date.now() - startedAt);
  const text = (response.content || [])
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("")
    .trim();
  return {
    text,
    cacheRead: response.usage?.cache_read_input_tokens ?? 0,
    cacheCreate: response.usage?.cache_creation_input_tokens ?? 0,
  };
}

export async function runCompletionResilient(opts: CompletionOptions): Promise<{
  text: string;
  cacheRead: number;
  cacheCreate: number;
  provider: "gemini" | "openai";
}> {
  const result = await runCompletion(opts);
  return { ...result, provider: modelFor(opts) === OPENAI_MODELS.GPT_4O ? "openai" : "gemini" };
}
