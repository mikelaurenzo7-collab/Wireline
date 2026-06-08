/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenRouter chat completions — OpenAI-compatible tool calling for Director.
 */
import type { ToolSchema } from "./claude-structured";
import type { StreamCallbacks, StructuredResult } from "./claude-structured";
import { recordOpenRouterUsage } from "./claude-audit";
import { estimateOpenRouterCostUsd } from "./openrouter-models";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function openRouterHeaders(): Record<string, string> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL || "https://trywireline.com",
    "X-Title": "Wireline Director",
  };
}

function toolToOpenAI(tool: ToolSchema) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.input_schema,
    },
  };
}

export interface OpenRouterStructuredOptions {
  model: string;
  system: string;
  user: string;
  tool: ToolSchema;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Apply one SSE `data:` line from OpenRouter stream (exported for tests). */
export function accumulateOpenRouterStreamLine(
  trimmedLine: string,
  toolArgsByIndex: Map<number, string>,
): { prompt_tokens?: number; completion_tokens?: number } | undefined {
  if (!trimmedLine.startsWith("data: ")) return undefined;
  const payload = trimmedLine.slice(6);
  if (payload === "[DONE]") return undefined;
  let chunk: any;
  try {
    chunk = JSON.parse(payload);
  } catch {
    return undefined;
  }
  const usage =
    chunk.usage != null
      ? {
          prompt_tokens: chunk.usage.prompt_tokens as number | undefined,
          completion_tokens: chunk.usage.completion_tokens as number | undefined,
        }
      : undefined;
  const delta = chunk.choices?.[0]?.delta;
  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      const prev = toolArgsByIndex.get(idx) ?? "";
      toolArgsByIndex.set(idx, prev + (tc.function?.arguments ?? ""));
    }
  }
  return usage;
}

export interface OpenRouterCompletionOptions {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface OpenRouterImageGenerationOptions {
  model: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: "0.5K" | "1K" | "2K" | "4K";
  signal?: AbortSignal;
}

/** Extract base64 data URLs from OpenRouter image-generation responses. */
export function extractOpenRouterImageDataUrls(body: unknown): string[] {
  const urls: string[] = [];
  const choices = (body as { choices?: unknown[] })?.choices;
  if (!Array.isArray(choices)) return urls;

  for (const choice of choices) {
    const message = (choice as { message?: Record<string, unknown> })?.message;
    if (!message) continue;

    const images = message.images;
    if (Array.isArray(images)) {
      for (const image of images) {
        const url = extractImageUrlFromOpenRouterImage(image);
        if (url) urls.push(url);
      }
    }

    const content = message.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const p = part as Record<string, unknown>;
        if (p.type === "image_url" && p.image_url && typeof p.image_url === "object") {
          const nested = (p.image_url as { url?: string }).url;
          if (nested?.startsWith("data:image/")) urls.push(nested);
        }
      }
    }
  }

  return urls;
}

function extractImageUrlFromOpenRouterImage(image: unknown): string | null {
  if (!image || typeof image !== "object") return null;
  const o = image as Record<string, unknown>;
  const snake = o.image_url;
  if (snake && typeof snake === "object") {
    const url = (snake as { url?: string }).url;
    if (url?.startsWith("data:image/")) return url;
  }
  const camel = o.imageUrl;
  if (camel && typeof camel === "object") {
    const url = (camel as { url?: string }).url;
    if (url?.startsWith("data:image/")) return url;
  }
  return null;
}

/** Plain-text completion for Design Studio builder and creative consultants. */
export async function runOpenRouterCompletion(opts: OpenRouterCompletionOptions): Promise<string> {
  const t0 = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8192,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const latencyMs = Date.now() - t0;
  const usage = body.usage ?? {};
  recordOpenRouterUsage(
    opts.model,
    {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
    latencyMs,
  );

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned empty completion");
  return text;
}

/** Image-only models (e.g. x-ai/grok-imagine-image-quality) via modalities: ["image"]. */
export async function runOpenRouterImageGeneration(
  opts: OpenRouterImageGenerationOptions,
): Promise<string[]> {
  const t0 = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1024,
      modalities: ["image"],
      messages: [{ role: "user", content: opts.prompt }],
      ...(opts.aspectRatio || opts.imageSize
        ? {
            image_config: {
              ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
              ...(opts.imageSize ? { image_size: opts.imageSize } : {}),
            },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter image error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const body = await res.json();
  const latencyMs = Date.now() - t0;
  const usage =
    (body as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage ?? {};
  recordOpenRouterUsage(
    opts.model,
    {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
    latencyMs,
  );

  const urls = extractOpenRouterImageDataUrls(body);
  if (!urls.length) throw new Error("OpenRouter returned no generated images");
  return urls;
}

export async function runOpenRouterStructured<T = any>(
  opts: OpenRouterStructuredOptions,
): Promise<StructuredResult<T>> {
  const t0 = Date.now();
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      tools: [toolToOpenAI(opts.tool)],
      tool_choice: { type: "function", function: { name: opts.tool.name } },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const body = (await res.json()) as any;
  const latencyMs = Date.now() - t0;
  const usage = body.usage ?? {};
  recordOpenRouterUsage(
    opts.model,
    {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
    latencyMs,
  );

  const choice = body.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.find(
    (tc: any) => tc?.function?.name === opts.tool.name,
  );
  if (!toolCall?.function?.arguments) {
    throw new Error(`OpenRouter returned no ${opts.tool.name} tool call`);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(toolCall.function.arguments) as T;
  } catch {
    throw new Error(`OpenRouter tool arguments were not valid JSON`);
  }

  return { result: parsed };
}

export async function runOpenRouterStructuredStream<T = any>(
  opts: OpenRouterStructuredOptions,
  callbacks: StreamCallbacks,
): Promise<StructuredResult<T>> {
  const t0 = Date.now();

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      tools: [toolToOpenAI(opts.tool)],
      tool_choice: { type: "function", function: { name: opts.tool.name } },
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter stream error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolArgsByIndex = new Map<number, string>();
  let usage = { prompt_tokens: 0, completion_tokens: 0 };

  const onAbort = () => {
    void reader.cancel();
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (opts.signal?.aborted) {
        throw new DOMException("OpenRouter stream aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const lineUsage = accumulateOpenRouterStreamLine(line.trim(), toolArgsByIndex);
        if (lineUsage?.prompt_tokens != null) {
          usage.prompt_tokens = lineUsage.prompt_tokens;
        }
        if (lineUsage?.completion_tokens != null) {
          usage.completion_tokens = lineUsage.completion_tokens;
        }
      }
    }
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }

  const latencyMs = Date.now() - t0;
  recordOpenRouterUsage(
    opts.model,
    { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens },
    latencyMs,
  );

  const argsJson = toolArgsByIndex.get(0);
  if (!argsJson) {
    throw new Error(`OpenRouter stream returned no ${opts.tool.name} tool call`);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(argsJson) as T;
  } catch {
    throw new Error("OpenRouter streamed tool arguments were not valid JSON");
  }

  callbacks.onResult?.(parsed);
  return { result: parsed };
}

export function openRouterCostEstimate(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  return estimateOpenRouterCostUsd(modelId, {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });
}
