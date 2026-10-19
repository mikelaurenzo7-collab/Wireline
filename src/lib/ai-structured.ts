import { DEFAULT_MODEL, selectModelForTask, type TaskComplexity } from "./ai-models";
import { recordUsage } from "./ai-audit";
import { getRuntimeClient, type RuntimeImageInput } from "./ai-client";
import { providerIdentityStore, runWithProviderIdentity } from "./provider-identity-context";
import { tenantStore } from "./tenant-context-store";

export type StructuredToolSchema = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};
export type StructuredOptions = {
  system: string;
  user: string;
  images?: RuntimeImageInput[];
  tool: StructuredToolSchema;
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
  onResult?: (result: unknown) => void;
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
const modelFor = (opts: { model?: string; complexity?: TaskComplexity }) =>
  opts.model ?? (opts.complexity ? selectModelForTask(opts.complexity) : DEFAULT_MODEL);

/**
 * Authenticated routes already carry a tenantStore context for RLS. Copy that
 * identity into the provider-only context for the duration of the actual model
 * invocation. Durable workers set providerIdentityStore at dispatch instead,
 * so they never need to enter the database/RLS context.
 */
function withStructuredProviderIdentity<T>(operation: () => T): T {
  if (providerIdentityStore.getStore()?.trim()) return operation();
  const tenantId = tenantStore.getStore()?.trim();
  return tenantId ? runWithProviderIdentity(tenantId, operation) : operation();
}

function bodyFor(opts: StructuredOptions, model: string) {
  return {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [
      {
        role: "user",
        content: opts.images?.length
          ? [{ type: "text", text: opts.user }, ...opts.images]
          : opts.user,
      },
    ],
  };
}
function structuredResult<T>(
  response: { content?: Array<{ type?: string; name?: string; input?: unknown }> },
  toolName: string,
): T {
  const block = response.content?.find(
    (item) => item.type === "tool_use" && item.name === toolName,
  );
  if (!block) throw new Error(`AI runtime returned no ${toolName} structured result.`);
  return block.input as T;
}
export async function runStructured<T = unknown>(opts: StructuredOptions): Promise<T> {
  return (await runStructuredWithThinking<T>(opts)).result;
}
export async function runStructuredWithThinking<T = unknown>(
  opts: StructuredOptions,
): Promise<StructuredResult<T>> {
  const model = modelFor(opts),
    started = Date.now();
  const response = await withStructuredProviderIdentity(() =>
    getRuntimeClient().messages.create(bodyFor(opts, model), {
      signal: opts.signal,
    }),
  );
  recordUsage(model, response, Date.now() - started);
  return { result: structuredResult<T>(response, opts.tool.name) };
}
export async function runStructuredStream<T = unknown>(
  opts: StructuredOptions,
  callbacks: StreamCallbacks,
): Promise<StructuredResult<T>> {
  const model = modelFor(opts),
    started = Date.now();
  try {
    callbacks.onThinkingStart?.();
    callbacks.onThinkingChunk?.("Preparing structured response…");
    const stream = withStructuredProviderIdentity(() =>
      getRuntimeClient().messages.stream(bodyFor(opts, model), {
        signal: opts.signal,
      }),
    );
    for await (const _event of stream) {
      if (opts.signal?.aborted) throw new DOMException("Structured stream aborted", "AbortError");
    }
    const response = await stream.finalMessage();
    const elapsed = Date.now() - started;
    recordUsage(model, response, elapsed);
    const result = structuredResult<T>(response, opts.tool.name);
    callbacks.onThinkingEnd?.("Structured response ready.", elapsed);
    callbacks.onResult?.(result);
    return { result };
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
export async function runCompletion(
  opts: CompletionOptions,
): Promise<{ text: string; cacheRead: number; cacheCreate: number }> {
  const model = modelFor(opts),
    started = Date.now();
  const response = await withStructuredProviderIdentity(() =>
    getRuntimeClient().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  );
  recordUsage(model, response, Date.now() - started);
  const text = (response.content || [])
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
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
  provider: "xai" | "openai";
}> {
  const result = await runCompletion(opts);
  return {
    ...result,
    provider: /^grok-/i.test(modelFor(opts)) ? "xai" : "openai",
  };
}
