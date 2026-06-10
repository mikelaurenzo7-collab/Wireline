/**
 * Claude Client Singleton with Resilient Fallbacks
 * ---------------------------------------------------------------------------
 * Manages the Anthropic SDK client lifecycle and intercepts messages.create
 * and messages.stream calls to fall back to Gemini 3.5 Flash, then to OpenRouter
 * (DeepSeek Chat) if Anthropic calls fail or are unconfigured.
 */

import Anthropic from "@anthropic-ai/sdk";
import { log } from "./server-logger";

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
    const finalPrompt = `\nYou must respond with a JSON object matching this schema:\n${JSON.stringify(targetTool.input_schema, null, 2)}`;
    if (contents.length > 0) {
      contents[contents.length - 1].parts[0].text += finalPrompt;
    }
  }

  const result = await model.generateContent({
    contents,
    generationConfig,
  });

  const text = result.response.text();
  const inputTokens = result.response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = result.response.usageMetadata?.candidatesTokenCount || 0;

  if (targetTool) {
    const parsed = parseStructuredJson(text);

    return buildFallbackMessage({
      model: geminiModelId,
      content: [
        {
          type: "tool_use",
          id: "call_" + Math.random().toString(36).substring(2),
          caller: { type: "direct" },
          name: targetTool.name,
          input: parsed,
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

async function callOpenRouter(body: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const openRouterModel = "deepseek/deepseek-chat";

  const systemPrompt = extractSystemText(body.system);

  const mappedMessages = body.messages.map((msg) => ({
    role: msg.role,
    content: extractMessageText(msg.content),
  }));

  const targetTool = firstFunctionTool(body);
  const payload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    response_format?: { type: string };
  } = {
    model: openRouterModel,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...mappedMessages,
    ],
    max_tokens: body.max_tokens ?? 4096,
  };

  if (targetTool) {
    payload.response_format = { type: "json_object" };
    const guidelines = `\nYou must return a JSON object matching this schema:\n${JSON.stringify(targetTool.input_schema, null, 2)}`;
    payload.messages[payload.messages.length - 1].content += guidelines;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://trywireline.com",
      "X-Title": "Wireline Director",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API failed: ${response.status} - ${errorText}`);
  }

  const resJson = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = resJson.choices?.[0]?.message?.content || "";
  const inputTokens = resJson.usage?.prompt_tokens || 0;
  const outputTokens = resJson.usage?.completion_tokens || 0;

  if (targetTool) {
    const parsed = parseStructuredJson(text);

    return buildFallbackMessage({
      model: openRouterModel,
      content: [
        {
          type: "tool_use",
          id: "call_" + Math.random().toString(36).substring(2),
          caller: { type: "direct" },
          name: targetTool.name,
          input: parsed,
        },
      ],
      stopReason: "tool_use",
      inputTokens,
      outputTokens,
    });
  }

  return buildFallbackMessage({
    model: openRouterModel,
    content: [{ type: "text", text, citations: null }],
    stopReason: "end_turn",
    inputTokens,
    outputTokens,
  });
}

async function createWithFallbacks(
  realClient: Anthropic | null,
  body: Anthropic.MessageCreateParams,
  options?: RequestOptions,
): Promise<Anthropic.Message> {
  if (realClient) {
    try {
      return (await realClient.messages.create(body, options)) as Anthropic.Message;
    } catch (anthropicErr) {
      log.warn("[claude-client] Anthropic call failed, trying Gemini fallback", {
        error: errorMessage(anthropicErr),
      });
    }
  }

  try {
    return await callGemini(body);
  } catch (geminiErr) {
    log.warn("[claude-client] Gemini fallback failed, trying OpenRouter fallback", {
      error: errorMessage(geminiErr),
    });
    return await callOpenRouter(body);
  }
}

/** Minimal MessageStream-compatible shape produced by the non-Anthropic fallbacks. */
function buildFallbackStream(promise: Promise<Anthropic.Message>) {
  return {
    async *[Symbol.asyncIterator]() {
      const message = await promise;
      const block = message.content[0];
      yield {
        type: "content_block_start",
        index: 0,
        content_block: block,
      };

      const delta =
        block.type === "text"
          ? { type: "text_delta", text: block.text }
          : {
              type: "input_json_delta",
              partial_json: JSON.stringify(block.type === "tool_use" ? block.input : {}),
            };

      yield {
        type: "content_block_delta",
        index: 0,
        delta,
      };

      yield {
        type: "content_block_stop",
        index: 0,
      };
    },
    async finalMessage() {
      return await promise;
    },
  };
}

export function getClient(): Anthropic {
  if (!_client) {
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const realClient = hasAnthropicKey
      ? new Anthropic({
          timeout: 120_000,
          maxRetries: 2,
        })
      : null;

    const handler: ProxyHandler<Record<string | symbol, unknown>> = {
      get(_target, prop) {
        if (prop === "messages") {
          return {
            create: (body: Anthropic.MessageCreateParams, options?: RequestOptions) =>
              createWithFallbacks(realClient, body, options),
            stream: (body: Anthropic.MessageCreateParams, options?: RequestOptions) => {
              if (realClient) {
                try {
                  return realClient.messages.stream(body as Anthropic.MessageStreamParams, options);
                } catch (anthropicErr) {
                  log.warn("[claude-client] Anthropic stream failed, trying fallbacks", {
                    error: errorMessage(anthropicErr),
                  });
                }
              }

              const promise = (async () => {
                try {
                  return await callGemini(body);
                } catch (geminiErr) {
                  log.warn(
                    "[claude-client] Gemini stream fallback failed, trying OpenRouter fallback",
                    { error: errorMessage(geminiErr) },
                  );
                  return await callOpenRouter(body);
                }
              })();

              return buildFallbackStream(promise);
            },
          };
        }
        return realClient
          ? (realClient as unknown as Record<string | symbol, unknown>)[prop]
          : undefined;
      },
    };

    _client = new Proxy({}, handler) as unknown as Anthropic;
  }
  return _client;
}

export class ClaudeUnavailableError extends Error {
  status = 503;
  constructor() {
    super("Claude Brain is offline — set ANTHROPIC_API_KEY to enable advanced features.");
    this.name = "ClaudeUnavailableError";
  }
}

export function isClaudeAvailable(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );
}
