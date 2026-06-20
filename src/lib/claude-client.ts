/**
 * Provider-neutral structured runtime adapter.
 *
 * Historical callers still import this path while the repository is being
 * consolidated. No Anthropic SDK or Anthropic API path remains here:
 * OpenAI Responses is primary and Gemini is the automatic fallback.
 */

import { log } from "./server-logger";
import {
  GEMINI_STRUCTURED_FALLBACK_MODEL,
  OPENAI_STRUCTURED_PRIMARY_MODEL,
} from "./claude-models";

export type RuntimeTextBlock = {
  type: "text";
  text: string;
  citations?: null;
};

export type RuntimeToolUseBlock = {
  type: "tool_use";
  id: string;
  caller?: { type: "direct" };
  name: string;
  input: unknown;
};

export type RuntimeContentBlock = RuntimeTextBlock | RuntimeToolUseBlock;
export type RuntimeStopReason = "end_turn" | "tool_use";

/**
 * Loose on purpose: legacy recipes still pass provider-shaped tool descriptors.
 * Only tools with a Wireline `input_schema` are selected as structured output.
 */
export type RuntimeTool = {
  name?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  type?: string;
  [key: string]: unknown;
};

export type RuntimeMessageParam = {
  role: string;
  content: unknown;
};

export type RuntimeRequest = {
  model?: string;
  max_tokens?: number;
  system?: unknown;
  messages: RuntimeMessageParam[];
  tools?: RuntimeTool[];
  tool_choice?: unknown;
  [key: string]: unknown;
};

export type RuntimeMessage = {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: RuntimeContentBlock[];
  stop_reason: RuntimeStopReason;
  stop_sequence: null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
};

export type RuntimeRequestOptions = { signal?: AbortSignal };

export type RuntimeClient = {
  messages: {
    create: (body: RuntimeRequest, options?: RuntimeRequestOptions) => Promise<RuntimeMessage>;
    stream: (body: RuntimeRequest, options?: RuntimeRequestOptions) => {
      [Symbol.asyncIterator](): AsyncGenerator<unknown>;
      finalMessage(): Promise<RuntimeMessage>;
    };
  };
};

let client: RuntimeClient | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";

  const block = value as Record<string, unknown>;
  if (typeof block.text === "string") return block.text;
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) return extractText(block.content);

  // Preserve the presence of a legacy document attachment in the prompt. The
  // OpenAI-native file ingestion migration is tracked separately; we never
  // pretend its bytes were read when they were not passed as an input_file.
  if (block.type === "document") {
    const title = typeof block.title === "string" ? block.title : "attached document";
    return `[${title} attached; use only explicitly supplied extracted text.]`;
  }
  return "";
}

function extractSystemText(system: unknown): string {
  return extractText(system);
}

function extractMessageText(content: unknown): string {
  return extractText(content);
}

function structuredOutputTool(body: RuntimeRequest): Required<Pick<RuntimeTool, "name" | "input_schema">> | null {
  for (const tool of body.tools || []) {
    if (
      tool &&
      typeof tool.name === "string" &&
      tool.name.trim() &&
      tool.input_schema &&
      typeof tool.input_schema === "object"
    ) {
      return { name: tool.name, input_schema: tool.input_schema };
    }
  }
  return null;
}

function parseStructuredJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(match?.[1] ? match[1].trim() : cleaned);
  }
}

function runtimeMessage(args: {
  model: string;
  content: RuntimeContentBlock[];
  stopReason: RuntimeStopReason;
  inputTokens: number;
  outputTokens: number;
}): RuntimeMessage {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    model: args.model,
    content: args.content,
    stop_reason: args.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

function extractResponsesText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.text === "string") chunks.push(record.text);
    const content = Array.isArray(record.content) ? record.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const value = part as Record<string, unknown>;
      if (typeof value.text === "string") chunks.push(value.text);
    }
  }
  return chunks.join("\n").trim();
}

async function callOpenAI(body: RuntimeRequest, options?: RuntimeRequestOptions): Promise<RuntimeMessage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const requestedModel = String(body.model || "").trim();
  const model = requestedModel.startsWith("gpt-") ? requestedModel : OPENAI_STRUCTURED_PRIMARY_MODEL;
  const systemPrompt = extractSystemText(body.system);
  const targetTool = structuredOutputTool(body);
  const startedAt = Date.now();

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: options?.signal,
    body: JSON.stringify({
      model,
      instructions: systemPrompt || undefined,
      input: body.messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: extractMessageText(message.content),
      })),
      max_output_tokens: body.max_tokens ?? 4096,
      ...(targetTool
        ? {
            text: {
              format: {
                type: "json_schema",
                name: targetTool.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
                schema: targetTool.input_schema,
                strict: false,
              },
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Responses request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const text = extractResponsesText(payload);
  if (!text) throw new Error("OpenAI returned an empty response");
  const usage = (payload.usage || {}) as Record<string, unknown>;
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);

  log.info("[runtime] OpenAI structured response complete", {
    model,
    latencyMs: Date.now() - startedAt,
    structured: !!targetTool,
  });

  if (targetTool) {
    return runtimeMessage({
      model,
      content: [
        {
          type: "tool_use",
          id: `call_${Math.random().toString(36).slice(2)}`,
          caller: { type: "direct" },
          name: targetTool.name,
          input: parseStructuredJson(text),
        },
      ],
      stopReason: "tool_use",
      inputTokens,
      outputTokens,
    });
  }

  return runtimeMessage({
    model,
    content: [{ type: "text", text, citations: null }],
    stopReason: "end_turn",
    inputTokens,
    outputTokens,
  });
}

async function callGemini(body: RuntimeRequest): Promise<RuntimeMessage> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const modelId = GEMINI_STRUCTURED_FALLBACK_MODEL;
  const systemPrompt = extractSystemText(body.system);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId, systemInstruction: systemPrompt || undefined });
  const targetTool = structuredOutputTool(body);
  const contents = body.messages.map((message) => ({
    role: message.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: extractMessageText(message.content) }],
  }));
  const generationConfig: { responseMimeType?: string } = {};

  if (targetTool) {
    generationConfig.responseMimeType = "application/json";
    if (contents.length > 0) {
      contents[contents.length - 1].parts[0].text += `\nReturn one JSON object matching this schema:\n${JSON.stringify(targetTool.input_schema, null, 2)}`;
    }
  }

  const result = await model.generateContent({ contents, generationConfig });
  const text = result.response.text();
  const inputTokens = result.response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = result.response.usageMetadata?.candidatesTokenCount || 0;

  if (targetTool) {
    return runtimeMessage({
      model: modelId,
      content: [
        {
          type: "tool_use",
          id: `call_${Math.random().toString(36).slice(2)}`,
          caller: { type: "direct" },
          name: targetTool.name,
          input: parseStructuredJson(text),
        },
      ],
      stopReason: "tool_use",
      inputTokens,
      outputTokens,
    });
  }

  return runtimeMessage({
    model: modelId,
    content: [{ type: "text", text, citations: null }],
    stopReason: "end_turn",
    inputTokens,
    outputTokens,
  });
}

async function createWithFallbacks(body: RuntimeRequest, options?: RuntimeRequestOptions): Promise<RuntimeMessage> {
  try {
    return await callOpenAI(body, options);
  } catch (openAiError) {
    log.warn("[runtime] OpenAI request failed; trying Gemini fallback", {
      error: errorMessage(openAiError),
    });
    return callGemini(body);
  }
}

function buildFallbackStream(promise: Promise<RuntimeMessage>) {
  return {
    async *[Symbol.asyncIterator]() {
      const message = await promise;
      const block = message.content[0];
      yield { type: "content_block_start", index: 0, content_block: block };
      const delta =
        block.type === "text"
          ? { type: "text_delta", text: block.text }
          : { type: "input_json_delta", partial_json: JSON.stringify(block.input) };
      yield { type: "content_block_delta", index: 0, delta };
      yield { type: "content_block_stop", index: 0 };
    },
    async finalMessage() {
      return promise;
    },
  };
}

/** Runtime client used by existing structured-task callers. */
export function getClient(): RuntimeClient {
  if (!client) {
    client = {
      messages: {
        create: createWithFallbacks,
        stream: (body, options) => buildFallbackStream(createWithFallbacks(body, options)),
      },
    };
  }
  return client;
}

/** @deprecated Historical name retained while callers migrate to runtime wording. */
export class ClaudeUnavailableError extends Error {
  status = 503;
  constructor() {
    super("AI runtime is unavailable — configure OpenAI or Gemini.");
    this.name = "RuntimeUnavailableError";
  }
}

export function isRuntimeAvailable(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
}

/** @deprecated Use isRuntimeAvailable. */
export const isClaudeAvailable = isRuntimeAvailable;
