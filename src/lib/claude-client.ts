/**
 * Legacy compatibility adapter for structured Wireline tasks.
 *
 * Existing callers still use Anthropic-shaped message types, but no request is
 * sent to Anthropic. Managed execution is Gemini first and OpenAI second.
 * Explicit user model choice belongs to the OpenRouter per-agent path, not to
 * this shared background fallback.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { log } from "./server-logger";
import { VAPI_VOICE_FALLBACK_MODEL } from "./voice-model-defaults";

let _client: Anthropic | null = null;

type RequestOptions = Parameters<Anthropic["messages"]["create"]>[1];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function extractSystemText(system: Anthropic.MessageCreateParams["system"]): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system.map((block) => (block.type === "text" ? block.text : "")).join("\n");
  }
  return "";
}

function extractMessageText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
  }
  return "";
}

function firstFunctionTool(body: Anthropic.MessageCreateParams): Anthropic.Tool | null {
  const tool = body.tools?.[0];
  return tool && "input_schema" in tool ? (tool as Anthropic.Tool) : null;
}

function parseStructuredJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(match?.[1] ? match[1].trim() : text.trim());
  }
}

function buildFallbackMessage(args: {
  model: string;
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.StopReason;
  inputTokens: number;
  outputTokens: number;
}): Anthropic.Message {
  return {
    id: "msg_" + Math.random().toString(36).substring(2),
    type: "message",
    role: "assistant",
    model: args.model,
    content: args.content,
    stop_reason: args.stopReason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    usage: {
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

async function callGemini(body: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModelId = "gemini-3.5-flash";
  const systemInstruction = extractSystemText(body.system);
  const model = genAI.getGenerativeModel({
    model: geminiModelId,
    systemInstruction: systemInstruction || undefined,
  });

  const contents = body.messages.map((msg) => ({
    role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: extractMessageText(msg.content) }],
  }));

  const targetTool = firstFunctionTool(body);
  const generationConfig: { responseMimeType?: string } = {};
  if (targetTool) {
    generationConfig.responseMimeType = "application/json";
    const schemaPrompt = `\nReturn one JSON object matching this schema:\n${JSON.stringify(targetTool.input_schema, null, 2)}`;
    if (contents.length > 0) contents[contents.length - 1].parts[0].text += schemaPrompt;
  }

  const result = await model.generateContent({ contents, generationConfig });
  const text = result.response.text();
  const inputTokens = result.response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = result.response.usageMetadata?.candidatesTokenCount || 0;

  if (targetTool) {
    return buildFallbackMessage({
      model: geminiModelId,
      content: [
        {
          type: "tool_use",
          id: "call_" + Math.random().toString(36).substring(2),
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

  return buildFallbackMessage({
    model: geminiModelId,
    content: [{ type: "text", text, citations: null }],
    stopReason: "end_turn",
    inputTokens,
    outputTokens,
  });
}

async function callOpenAI(body: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const model = VAPI_VOICE_FALLBACK_MODEL;
  const systemPrompt = extractSystemText(body.system);
  const targetTool = firstFunctionTool(body);
  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...body.messages.map((message) => ({
      role: message.role,
      content: extractMessageText(message.content),
    })),
  ];

  if (targetTool && messages.length > 0) {
    messages[messages.length - 1].content += `\nReturn one JSON object matching this schema:\n${JSON.stringify(targetTool.input_schema, null, 2)}`;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: body.max_tokens ?? 4096,
      ...(targetTool ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = payload.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("OpenAI returned an empty completion");
  const inputTokens = payload.usage?.prompt_tokens || 0;
  const outputTokens = payload.usage?.completion_tokens || 0;

  if (targetTool) {
    return buildFallbackMessage({
      model,
      content: [
        {
          type: "tool_use",
          id: "call_" + Math.random().toString(36).substring(2),
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

  return buildFallbackMessage({
    model,
    content: [{ type: "text", text, citations: null }],
    stopReason: "end_turn",
    inputTokens,
    outputTokens,
  });
}

async function createWithFallbacks(
  body: Anthropic.MessageCreateParams,
  _options?: RequestOptions,
): Promise<Anthropic.Message> {
  try {
    return await callGemini(body);
  } catch (geminiErr) {
    log.warn("[runtime] Gemini request failed; trying OpenAI fallback", {
      error: errorMessage(geminiErr),
    });
    return callOpenAI(body);
  }
}

function buildFallbackStream(promise: Promise<Anthropic.Message>) {
  return {
    async *[Symbol.asyncIterator]() {
      const message = await promise;
      const block = message.content[0];
      yield { type: "content_block_start", index: 0, content_block: block };
      const delta =
        block.type === "text"
          ? { type: "text_delta", text: block.text }
          : { type: "input_json_delta", partial_json: JSON.stringify(block.type === "tool_use" ? block.input : {}) };
      yield { type: "content_block_delta", index: 0, delta };
      yield { type: "content_block_stop", index: 0 };
    },
    async finalMessage() {
      return promise;
    },
  };
}

/**
 * Compatibility facade for existing structured-task callers. It never creates
 * an Anthropic SDK client; all calls route through Gemini then OpenAI.
 */
export function getClient(): Anthropic {
  if (!_client) {
    const handler: ProxyHandler<Record<string | symbol, unknown>> = {
      get(_target, prop) {
        if (prop === "messages") {
          return {
            create: (body: Anthropic.MessageCreateParams, options?: RequestOptions) =>
              createWithFallbacks(body, options),
            stream: (body: Anthropic.MessageCreateParams, options?: RequestOptions) =>
              buildFallbackStream(createWithFallbacks(body, options)),
          };
        }
        return undefined;
      },
    };
    _client = new Proxy({}, handler) as unknown as Anthropic;
  }
  return _client;
}

/** @deprecated Retained for callers that have not yet adopted runtime wording. */
export class ClaudeUnavailableError extends Error {
  status = 503;
  constructor() {
    super("AI runtime is unavailable — configure Gemini or OpenAI.");
    this.name = "ClaudeUnavailableError";
  }
}

export function isRuntimeAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

/** @deprecated Use isRuntimeAvailable. */
export const isClaudeAvailable = isRuntimeAvailable;
