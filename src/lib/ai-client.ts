/* Provider-neutral structured runtime adapter. Direct OpenAI is the managed
 * primary, Gemini provides the first continuity fallback, and the Vercel AI
 * Gateway is the governed multi-model route. Direct xAI is available only when
 * explicitly enabled as an experimental final fallback. */
import { log } from "./server-logger";
import {
  GEMINI_STRUCTURED_FALLBACK_MODEL,
  OPENAI_STRUCTURED_PRIMARY_MODEL,
  STRUCTURED_PRIMARY_MODEL,
  XAI_STRUCTURED_PRIMARY_MODEL,
} from "./ai-models";
import {
  AI_GATEWAY_BASE_URL,
  gatewayHeaders,
  gatewayModelId,
  isAIGatewayConfigured,
} from "./ai-gateway";

const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";

export type RuntimeTextBlock = { type: "text"; text: string; citations?: null };
export type RuntimeToolUseBlock = {
  type: "tool_use";
  id: string;
  caller?: { type: "direct" };
  name: string;
  input: unknown;
};
export type RuntimeContentBlock = RuntimeTextBlock | RuntimeToolUseBlock;
export type RuntimeStopReason = "end_turn" | "tool_use" | "pause_turn";
export type RuntimeTool = {
  name?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  type?: string;
  [key: string]: unknown;
};
export type RuntimeMessageParam = { role: string; content: unknown };
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
    stream: (
      body: RuntimeRequest,
      options?: RuntimeRequestOptions,
    ) => {
      [Symbol.asyncIterator](): AsyncGenerator<unknown>;
      finalMessage(): Promise<RuntimeMessage>;
    };
  };
};

type RuntimeProviderName = "xAI" | "OpenAI" | "Gemini" | "AI Gateway";
type RuntimeProvider = {
  name: RuntimeProviderName;
  call: (body: RuntimeRequest, options?: RuntimeRequestOptions) => Promise<RuntimeMessage>;
  breaker?: RuntimeCircuitBreaker;
};

let client: RuntimeClient | null = null;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  const block = value as Record<string, unknown>;
  if (typeof block.text === "string") return block.text;
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) return extractText(block.content);
  if (block.type === "document")
    return `[${typeof block.title === "string" ? block.title : "attached document"} attached; use only explicitly supplied extracted text.]`;
  return "";
}

const structuredOutputTool = (
  body: RuntimeRequest,
): Required<Pick<RuntimeTool, "name" | "input_schema">> | null => {
  for (const tool of body.tools || [])
    if (
      tool &&
      typeof tool.name === "string" &&
      tool.name.trim() &&
      tool.input_schema &&
      typeof tool.input_schema === "object"
    )
      return { name: tool.name, input_schema: tool.input_schema };
  return null;
};

function parseStructuredJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(match?.[1] ? match[1].trim() : cleaned);
  }
}

function message(args: {
  model: string;
  content: RuntimeContentBlock[];
  stopReason: RuntimeStopReason;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
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
      cache_read_input_tokens: args.cacheReadTokens ?? 0,
    },
  };
}

function extractResponsesText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim())
    return payload.output_text;
  const chunks: string[] = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.text === "string") chunks.push(record.text);
    for (const part of Array.isArray(record.content) ? record.content : []) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as Record<string, unknown>).text === "string"
      )
        chunks.push((part as Record<string, string>).text);
    }
  }
  return chunks.join("\n").trim();
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("AI request aborted");
  error.name = "AbortError";
  throw error;
}

// Wall-clock ceiling on any single provider attempt. Structured responses
// (small JSON) rarely need more than 30s; 60s leaves headroom for the largest
// documented tool-call chains while still bounding fallback advancement so a
// stalled provider cannot hold a request thread open indefinitely.
const RUNTIME_REQUEST_TIMEOUT_MS = 60_000;

// Compose the caller-supplied signal with our per-attempt timeout so both
// paths abort the underlying fetch/SDK call. Returns the merged signal plus a
// `dispose()` to clear the timer once the attempt settles.
function withRequestTimeout(callerSignal?: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
  timedOut: () => boolean;
} {
  const controller = new AbortController();
  let timedOutFlag = false;
  const timer = setTimeout(() => {
    timedOutFlag = true;
    controller.abort(new Error(`AI provider timed out after ${RUNTIME_REQUEST_TIMEOUT_MS}ms`));
  }, RUNTIME_REQUEST_TIMEOUT_MS);
  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };
  if (callerSignal) {
    if (callerSignal.aborted) onCallerAbort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOutFlag,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

async function callResponsesEndpoint(args: {
  endpoint: string;
  headers: Record<string, string>;
  model: string;
  body: RuntimeRequest;
  options?: RuntimeRequestOptions;
  provider: RuntimeProviderName;
}): Promise<RuntimeMessage> {
  assertNotAborted(args.options?.signal);
  const tool = structuredOutputTool(args.body);
  const started = Date.now();
  const timer = withRequestTimeout(args.options?.signal);
  let response: Response;
  try {
    response = await fetch(args.endpoint, {
      method: "POST",
      headers: args.headers,
      signal: timer.signal,
      body: JSON.stringify({
        model: args.model,
        instructions: extractText(args.body.system) || undefined,
        input: args.body.messages.map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: extractText(item.content),
        })),
        max_output_tokens: args.body.max_tokens ?? 4096,
        ...(tool
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: tool.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
                  schema: tool.input_schema,
                  strict: false,
                },
              },
            }
          : {}),
      }),
    });
  } catch (err) {
    if (timer.timedOut()) {
      timer.dispose();
      throw new Error(
        `${args.provider} Responses request timed out after ${RUNTIME_REQUEST_TIMEOUT_MS}ms`,
      );
    }
    timer.dispose();
    throw err;
  }
  timer.dispose();

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    log.warn("[ai-runtime] provider request rejected", {
      provider: args.provider,
      status: response.status,
      detail,
    });
    throw new Error(`${args.provider} Responses request failed (${response.status})`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const text = extractResponsesText(payload);
  if (!text) throw new Error(`${args.provider} returned an empty response`);
  const usage = (payload.usage || {}) as Record<string, unknown>;
  // OpenAI Responses reports cached prompt tokens inside input_tokens (details
  // under input_tokens_details.cached_tokens). Split them out so cached input
  // is priced at the vendor's cached rate instead of the full input rate and
  // the audit dashboard's cache-savings view stops reading zero.
  const usageDetails = (usage.input_tokens_details || {}) as Record<string, unknown>;
  const cacheReadTokens = Math.max(0, Number(usageDetails.cached_tokens || 0));
  const inputTokens = Math.max(0, Number(usage.input_tokens || 0) - cacheReadTokens);
  const outputTokens = Number(usage.output_tokens || 0);
  log.info("[ai-runtime] response complete", {
    provider: args.provider,
    model: args.model,
    latencyMs: Date.now() - started,
    structured: !!tool,
  });

  return tool
    ? message({
        model: args.model,
        content: [
          {
            type: "tool_use",
            id: `call_${Math.random().toString(36).slice(2)}`,
            caller: { type: "direct" },
            name: tool.name,
            input: parseStructuredJson(text),
          },
        ],
        stopReason: "tool_use",
        inputTokens,
        outputTokens,
        cacheReadTokens,
      })
    : message({
        model: args.model,
        content: [{ type: "text", text, citations: null }],
        stopReason: "end_turn",
        inputTokens,
        outputTokens,
        cacheReadTokens,
      });
}

async function callXAI(
  body: RuntimeRequest,
  options?: RuntimeRequestOptions,
): Promise<RuntimeMessage> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY not configured");
  const requested = String(body.model || "").trim();
  // Only forward xAI-native model ids directly. This path is opt-in and never
  // receives OpenAI or Gemini ids from the managed launch default.
  const model = /grok/i.test(requested) ? requested : XAI_STRUCTURED_PRIMARY_MODEL;
  return callResponsesEndpoint({
    endpoint: XAI_RESPONSES_URL,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    model,
    body,
    options,
    provider: "xAI",
  });
}

async function callGateway(
  body: RuntimeRequest,
  options?: RuntimeRequestOptions,
): Promise<RuntimeMessage> {
  if (!isAIGatewayConfigured()) throw new Error("AI Gateway is not configured");
  return callResponsesEndpoint({
    endpoint: `${AI_GATEWAY_BASE_URL}/responses`,
    headers: gatewayHeaders(),
    model: gatewayModelId(String(body.model || STRUCTURED_PRIMARY_MODEL)),
    body,
    options,
    provider: "AI Gateway",
  });
}

async function callOpenAI(
  body: RuntimeRequest,
  options?: RuntimeRequestOptions,
): Promise<RuntimeMessage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const requested = String(body.model || "").trim();
  const model = requested.startsWith("gpt-") ? requested : OPENAI_STRUCTURED_PRIMARY_MODEL;
  return callResponsesEndpoint({
    endpoint: "https://api.openai.com/v1/responses",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    model,
    body,
    options,
    provider: "OpenAI",
  });
}

async function callGemini(
  body: RuntimeRequest,
  options?: RuntimeRequestOptions,
): Promise<RuntimeMessage> {
  assertNotAborted(options?.signal);
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const modelId = GEMINI_STRUCTURED_FALLBACK_MODEL;
  const tool = structuredOutputTool(body);
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelId,
    systemInstruction: extractText(body.system) || undefined,
  });
  const contents = body.messages.map((item) => ({
    role: item.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: extractText(item.content) }],
  }));
  const generationConfig: { responseMimeType?: string } = {};
  if (tool) {
    generationConfig.responseMimeType = "application/json";
    if (contents.length)
      contents[contents.length - 1].parts[0].text +=
        `\nReturn one JSON object matching this schema:\n${JSON.stringify(tool.input_schema, null, 2)}`;
  }
  // Google SDK does not forward AbortSignal; race the promise against a timer
  // so a stalled Gemini call cannot hold the request open past the ceiling.
  const timer = withRequestTimeout(options?.signal);
  let result: Awaited<ReturnType<typeof model.generateContent>>;
  try {
    result = await new Promise((resolve, reject) => {
      const onAbort = () => {
        const reason =
          timer.signal.reason instanceof Error
            ? timer.signal.reason
            : new Error(
                timer.timedOut()
                  ? `Gemini request timed out after ${RUNTIME_REQUEST_TIMEOUT_MS}ms`
                  : "Gemini request aborted",
              );
        reject(reason);
      };
      if (timer.signal.aborted) return onAbort();
      timer.signal.addEventListener("abort", onAbort, { once: true });
      model.generateContent({ contents, generationConfig }).then(resolve, reject);
    });
  } finally {
    timer.dispose();
  }
  assertNotAborted(options?.signal);
  const text = result.response.text();
  const inputTokens = result.response.usageMetadata?.promptTokenCount || 0;
  const outputTokens = result.response.usageMetadata?.candidatesTokenCount || 0;
  return tool
    ? message({
        model: modelId,
        content: [
          {
            type: "tool_use",
            id: `call_${Math.random().toString(36).slice(2)}`,
            caller: { type: "direct" },
            name: tool.name,
            input: parseStructuredJson(text),
          },
        ],
        stopReason: "tool_use",
        inputTokens,
        outputTokens,
      })
    : message({
        model: modelId,
        content: [{ type: "text", text, citations: null }],
        stopReason: "end_turn",
        inputTokens,
        outputTokens,
      });
}

class RuntimeCircuitBreaker {
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failureCount = 0;
  private lastStateChange = Date.now();
  private readonly failureThreshold = 3;
  private readonly cooldownPeriodMs = 30_000;

  constructor(private readonly provider: RuntimeProviderName) {}

  isOpen(): boolean {
    const now = Date.now();
    if (this.state === "OPEN") {
      if (now - this.lastStateChange > this.cooldownPeriodMs) {
        this.transitionTo("HALF_OPEN");
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failureCount = 0;
    if (this.state !== "CLOSED") this.transitionTo("CLOSED");
  }

  recordFailure(error: unknown) {
    this.failureCount++;
    log.warn("[ai-circuit-breaker] provider failure recorded", {
      provider: this.provider,
      failureCount: this.failureCount,
      error: errorMessage(error),
    });
    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold)
      this.transitionTo("OPEN");
  }

  getState() {
    return this.state;
  }

  private transitionTo(next: "CLOSED" | "OPEN" | "HALF_OPEN") {
    this.state = next;
    this.lastStateChange = Date.now();
    if (next === "CLOSED") this.failureCount = 0;
  }
}

const xaiCircuitBreaker = new RuntimeCircuitBreaker("xAI");
const gatewayCircuitBreaker = new RuntimeCircuitBreaker("AI Gateway");
const openAICircuitBreaker = new RuntimeCircuitBreaker("OpenAI");
const geminiCircuitBreaker = new RuntimeCircuitBreaker("Gemini");

function xaiStructuredFallbackEnabled(): boolean {
  return process.env.WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK?.trim().toLowerCase() === "true";
}

function configuredProviders(): RuntimeProvider[] {
  const providers: RuntimeProvider[] = [];
  if (process.env.OPENAI_API_KEY)
    providers.push({ name: "OpenAI", call: callOpenAI, breaker: openAICircuitBreaker });
  if (process.env.GEMINI_API_KEY)
    providers.push({ name: "Gemini", call: callGemini, breaker: geminiCircuitBreaker });
  if (isAIGatewayConfigured())
    providers.push({ name: "AI Gateway", call: callGateway, breaker: gatewayCircuitBreaker });
  if (xaiStructuredFallbackEnabled() && process.env.XAI_API_KEY)
    providers.push({ name: "xAI", call: callXAI, breaker: xaiCircuitBreaker });
  return providers;
}

function nextAvailableProvider(
  providers: RuntimeProvider[],
  currentIndex: number,
): RuntimeProvider | undefined {
  return providers.slice(currentIndex + 1).find((provider) => !provider.breaker?.isOpen());
}

function fallbackMessage(from: RuntimeProviderName, to: RuntimeProviderName): string {
  if (from === "OpenAI" && to === "Gemini") return "OpenAI request failed; trying Gemini fallback";
  if (from === "Gemini" && to === "AI Gateway")
    return "Gemini request failed; trying AI Gateway fallback";
  if (from === "AI Gateway" && to === "xAI")
    return "AI Gateway request failed; trying explicitly enabled xAI fallback";
  return `${from} request failed; trying ${to} fallback`;
}

export class RuntimeUnavailableError extends Error {
  status = 503;
  constructor() {
    super("AI runtime is unavailable. Configure OpenAI, Gemini, or the AI Gateway.");
    this.name = "RuntimeUnavailableError";
  }
}

async function createWithFallbacks(
  body: RuntimeRequest,
  options?: RuntimeRequestOptions,
): Promise<RuntimeMessage> {
  assertNotAborted(options?.signal);
  const providers = configuredProviders();
  if (!providers.length) throw new RuntimeUnavailableError();

  let lastError: unknown = null;
  for (let index = 0; index < providers.length; index++) {
    const provider = providers[index];
    if (provider.breaker?.isOpen()) {
      log.info("[ai-runtime] provider circuit breaker open; skipping provider", {
        provider: provider.name,
        breakerState: provider.breaker.getState(),
      });
      continue;
    }

    try {
      const response = await provider.call(body, options);
      provider.breaker?.recordSuccess();
      return response;
    } catch (error) {
      if (isAbortError(error, options?.signal)) throw error;
      provider.breaker?.recordFailure(error);
      lastError = error;
      const next = nextAvailableProvider(providers, index);
      if (next)
        log.warn(`[ai-runtime] ${fallbackMessage(provider.name, next.name)}`, {
          error: errorMessage(error),
          breakerState: provider.breaker?.getState() || "NONE",
        });
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new RuntimeUnavailableError();
}

function fallbackStream(promise: Promise<RuntimeMessage>) {
  return {
    async *[Symbol.asyncIterator]() {
      const result = await promise;
      const block = result.content[0];
      yield { type: "content_block_start", index: 0, content_block: block };
      yield {
        type: "content_block_delta",
        index: 0,
        delta:
          block.type === "text"
            ? { type: "text_delta", text: block.text }
            : { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
      };
      yield { type: "content_block_stop", index: 0 };
    },
    async finalMessage() {
      return promise;
    },
  };
}

export function getRuntimeClient(): RuntimeClient {
  if (!client)
    client = {
      messages: {
        create: createWithFallbacks,
        stream: (body, options) => fallbackStream(createWithFallbacks(body, options)),
      },
    };
  return client;
}

export const isRuntimeAvailable = () =>
  Boolean(
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    isAIGatewayConfigured() ||
    (xaiStructuredFallbackEnabled() && process.env.XAI_API_KEY),
  );
