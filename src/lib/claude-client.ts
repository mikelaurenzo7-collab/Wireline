/**
 * Claude Client Singleton with Resilient Fallbacks
 * ---------------------------------------------------------------------------
 * Manages the Anthropic SDK client lifecycle and intercepts messages.create
 * and messages.stream calls to fall back to Gemini 3.5 Flash, then to OpenRouter
 * (DeepSeek Chat) if Anthropic calls fail or are unconfigured.
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

async function callGemini(body: any): Promise<any> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModelId = "gemini-3.5-flash";

  let systemInstruction = "";
  if (typeof body.system === "string") {
    systemInstruction = body.system;
  } else if (Array.isArray(body.system)) {
    systemInstruction = body.system.map((block: any) => block.text || "").join("\n");
  }

  const model = genAI.getGenerativeModel({
    model: geminiModelId,
    systemInstruction: systemInstruction || undefined,
  });

  const contents = body.messages.map((msg: any) => {
    const role = msg.role === "assistant" ? "model" : "user";
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.map((block: any) => block.text || "").join("\n");
    }
    return {
      role,
      parts: [{ text }],
    };
  });

  const isStructured = body.tools && body.tools.length > 0;
  const generationConfig: any = {};
  let finalPrompt = "";

  if (isStructured) {
    generationConfig.responseMimeType = "application/json";
    const targetTool = body.tools[0];
    finalPrompt = `\nYou must respond with a JSON object matching this schema:\n${JSON.stringify(targetTool.input_schema, null, 2)}`;
  }

  if (isStructured && contents.length > 0) {
    contents[contents.length - 1].parts[0].text += finalPrompt;
  }

  const result = await model.generateContent({
    contents,
    generationConfig,
  });

  const text = result.response.text();
  if (isStructured) {
    let parsed: any;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      parsed = JSON.parse(match?.[1] ? match[1].trim() : text.trim());
    }

    return {
      id: "msg_" + Math.random().toString(36).substring(2),
      type: "message",
      role: "assistant",
      model: geminiModelId,
      content: [
        {
          type: "tool_use",
          id: "call_" + Math.random().toString(36).substring(2),
          name: body.tools[0].name,
          input: parsed,
        }
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        input_tokens: result.response.usageMetadata?.promptTokenCount || 0,
        output_tokens: result.response.usageMetadata?.candidatesTokenCount || 0,
      }
    };
  } else {
    return {
      id: "msg_" + Math.random().toString(36).substring(2),
      type: "message",
      role: "assistant",
      model: geminiModelId,
      content: [
        {
          type: "text",
          text: text,
        }
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: result.response.usageMetadata?.promptTokenCount || 0,
        output_tokens: result.response.usageMetadata?.candidatesTokenCount || 0,
      }
    };
  }
}

async function callOpenRouter(body: any): Promise<any> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const openRouterModel = "deepseek/deepseek-chat";

  let systemPrompt = "";
  if (typeof body.system === "string") {
    systemPrompt = body.system;
  } else if (Array.isArray(body.system)) {
    systemPrompt = body.system.map((block: any) => block.text || "").join("\n");
  }

  const mappedMessages = body.messages.map((msg: any) => {
    let content = "";
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content.map((block: any) => block.text || "").join("\n");
    }
    return {
      role: msg.role,
      content,
    };
  });

  const isStructured = body.tools && body.tools.length > 0;
  const payload: any = {
    model: openRouterModel,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...mappedMessages,
    ],
    max_tokens: body.max_tokens ?? 4096,
  };

  if (isStructured) {
    payload.response_format = { type: "json_object" };
    const targetTool = body.tools[0];
    const guidelines = `\nYou must return a JSON object matching this schema:\n${JSON.stringify(targetTool.input_schema, null, 2)}`;
    payload.messages[payload.messages.length - 1].content += guidelines;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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

  const resJson = await response.json();
  const text = resJson.choices?.[0]?.message?.content || "";

  if (isStructured) {
    let parsed: any;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      parsed = JSON.parse(match?.[1] ? match[1].trim() : text.trim());
    }

    return {
      id: "msg_" + Math.random().toString(36).substring(2),
      type: "message",
      role: "assistant",
      model: openRouterModel,
      content: [
        {
          type: "tool_use",
          id: "call_" + Math.random().toString(36).substring(2),
          name: body.tools[0].name,
          input: parsed,
        }
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        input_tokens: resJson.usage?.prompt_tokens || 0,
        output_tokens: resJson.usage?.completion_tokens || 0,
      }
    };
  } else {
    return {
      id: "msg_" + Math.random().toString(36).substring(2),
      type: "message",
      role: "assistant",
      model: openRouterModel,
      content: [
        {
          type: "text",
          text: text,
        }
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: resJson.usage?.prompt_tokens || 0,
        output_tokens: resJson.usage?.completion_tokens || 0,
      }
    };
  }
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

    const handler = {
      get(target: any, prop: string) {
        if (prop === "messages") {
          return {
            create: async (body: any, options?: any) => {
              if (hasAnthropicKey && realClient) {
                try {
                  return await realClient.messages.create(body, options);
                } catch (anthropicErr: any) {
                  console.warn("Anthropic call failed, trying Gemini fallback:", anthropicErr.message || anthropicErr);
                }
              }

              try {
                return await callGemini(body);
              } catch (geminiErr: any) {
                console.warn("Gemini fallback failed, trying OpenRouter fallback:", geminiErr.message || geminiErr);
                return await callOpenRouter(body);
              }
            },
            stream: (body: any, options?: any) => {
              if (hasAnthropicKey && realClient) {
                try {
                  return realClient.messages.stream(body, options);
                } catch (anthropicErr: any) {
                  console.warn("Anthropic stream failed, trying Gemini stream fallback:", anthropicErr.message || anthropicErr);
                }
              }

              const runFallbackStream = async () => {
                try {
                  return await callGemini(body);
                } catch (geminiErr: any) {
                  console.warn("Gemini stream fallback failed, trying OpenRouter stream fallback:", geminiErr.message || geminiErr);
                  return await callOpenRouter(body);
                }
              };

              const promise = runFallbackStream();

              const mockStream = {
                async *[Symbol.asyncIterator]() {
                  const message = await promise;
                  yield {
                    type: "content_block_start",
                    index: 0,
                    content_block: message.content[0]
                  };

                  const delta = message.content[0].type === "text"
                    ? { type: "text_delta", text: message.content[0].text }
                    : { type: "input_json_delta", partial_json: JSON.stringify(message.content[0].input) };

                  yield {
                    type: "content_block_delta",
                    index: 0,
                    delta
                  };

                  yield {
                    type: "content_block_stop",
                    index: 0
                  };
                },
                async finalMessage() {
                  return await promise;
                }
              };

              return mockStream;
            }
          };
        }
        return realClient ? (realClient as any)[prop] : undefined;
      }
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
  return !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}
