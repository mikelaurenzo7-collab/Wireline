/* Provider-neutral structured runtime adapter. OpenAI is the managed
 * structured default, the Vercel AI Gateway is the governed continuity route,
 * Gemini is the final structured fallback. Live voice uses OpenAI Realtime
 * and is deliberately separate. Eligibility and ordering are owned
 * by `reasoning-provider-policy.ts`; this module owns transport only. */
import { log } from "./server-logger";
import { GEMINI_STRUCTURED_FALLBACK_MODEL, OPENAI_STRUCTURED_PRIMARY_MODEL } from "./ai-models";
import {
  orderReasoningProviders,
  resolveReasoningPreference,
  type ReasoningProviderId,
} from "./reasoning-provider-policy";
import {
  AI_GATEWAY_BASE_URL,
  gatewayHeaders,
  gatewayModelId,
  isAIGatewayConfigured,
} from "./ai-gateway";
import {
  normalizeResponsesUsage,
  normalizeUsageTokenCount,
  POSTGRES_INT32_MAX,
  saturatingUsageTokenSum,
} from "./ai-usage";
import { recordAmbiguousProviderAttempt, recordUsage } from "./ai-audit";
import { normalizeProviderReportedCostUsd } from "./ai-provider-cost";
import { currentProviderSafetyIdentifier } from "./provider-identity-context";

export type RuntimeTextBlock = { type: "text"; text: string; citations?: null };
/** Inline images only: never ask a provider to fetch an arbitrary customer URL. */
export type RuntimeImageInput = {
  type: "image";
  mimeType: "image/png";
  data: string;
  detail: "high" | "low";
};
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
  /** Actual inference provider when the transport reports it separately from the model creator. */
  inference_provider?: string;
  /** Authoritative per-request Gateway charge, when returned by Vercel. */
  actual_cost_usd?: number;
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

export type RuntimeProviderName = "OpenAI" | "Gemini" | "AI Gateway";

/**
 * An explicit provider HTTP 4xx means the request was rejected rather than
 * accepted for generation. Spend wrappers may release a pre-provider hold when
 * every attempted lane ends this way; 5xx, transport, timeout, parse, and abort
 * outcomes remain ambiguous or follow their existing cancellation handling.
 */
export class DefiniteProviderRejectionError extends Error {
  constructor(
    readonly provider: RuntimeProviderName,
    readonly status: number,
  ) {
    super(`${provider} request was rejected (${status})`);
    this.name = "DefiniteProviderRejectionError";
  }
}

/** A provider returned billable usage, but its output was unusable. */
class AccountedProviderOutputError extends Error {
  constructor(provider: RuntimeProviderName) {
    super(`${provider} returned an unusable response`);
    this.name = "AccountedProviderOutputError";
  }
}

function explicitProviderHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  for (const value of [candidate.status, candidate.statusCode]) {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && /^\d{3}$/.test(value.trim())
          ? Number(value)
          : NaN;
    if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) return parsed;
  }
  return null;
}

function definiteProviderRejection(
  error: unknown,
  provider: RuntimeProviderName,
): DefiniteProviderRejectionError | null {
  if (error instanceof DefiniteProviderRejectionError) return error;
  const status = explicitProviderHttpStatus(error);
  return status !== null && status >= 400 && status < 500
    ? new DefiniteProviderRejectionError(provider, status)
    : null;
}

type RuntimeProvider = {
  name: RuntimeProviderName;
  call: (body: RuntimeRequest, options?: RuntimeRequestOptions) => Promise<RuntimeMessage>;
  breaker?: RuntimeCircuitBreaker;
};

function knownTokenCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= POSTGRES_INT32_MAX
  );
}

export function hasKnownResponsesUsage(usage: Record<string, unknown>): boolean {
  if (!knownTokenCount(usage.input_tokens) || !knownTokenCount(usage.output_tokens)) return false;
  const details = usage.input_tokens_details;
  if (details === undefined) return true;
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const cache = details as Record<string, unknown>;
  const read = cache.cached_tokens === undefined ? 0 : cache.cached_tokens;
  const write = cache.cache_write_tokens === undefined ? 0 : cache.cache_write_tokens;
  return knownTokenCount(read) && knownTokenCount(write) && read + write <= usage.input_tokens;
}

let client: RuntimeClient | null = null;
/** Provider messages and JSON parse excerpts can contain customer input/output. */
function safeProviderErrorLabel(error: unknown): string {
  const type =
    error instanceof DefiniteProviderRejectionError
      ? "DefiniteProviderRejectionError"
      : error instanceof AccountedProviderOutputError
        ? "AccountedProviderOutputError"
        : error instanceof SyntaxError
          ? "SyntaxError"
          : error instanceof TypeError
            ? "TypeError"
            : error instanceof Error
              ? "Error"
              : "UnknownError";
  const status = explicitProviderHttpStatus(error);
  return status === null ? type : `${type} (HTTP ${status})`;
}

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

function imageInputs(value: unknown): RuntimeImageInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is RuntimeImageInput =>
      item?.type === "image" &&
      item.mimeType === "image/png" &&
      typeof item.data === "string" &&
      (item.detail === "high" || item.detail === "low"),
  );
}

/** Preserve actual multimodal input through every governed continuity lane. */
export function responsesInputContent(value: unknown) {
  const images = imageInputs(value);
  if (!images.length) return extractText(value);
  return [
    { type: "input_text", text: extractText(value) },
    ...images.map((image) => ({
      type: "input_image",
      detail: image.detail,
      image_url: `data:${image.mimeType};base64,${image.data}`,
    })),
  ];
}

export function geminiInputParts(value: unknown): import("@google/generative-ai").Part[] {
  return [
    { text: extractText(value) },
    ...imageInputs(value).map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })),
  ];
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
  inferenceProvider?: string;
  actualCostUsd?: number;
  content: RuntimeContentBlock[];
  stopReason: RuntimeStopReason;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): RuntimeMessage {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    model: args.model,
    ...(args.inferenceProvider ? { inference_provider: args.inferenceProvider } : {}),
    ...(typeof args.actualCostUsd === "number" ? { actual_cost_usd: args.actualCostUsd } : {}),
    content: args.content,
    stop_reason: args.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cache_creation_input_tokens: args.cacheWriteTokens ?? 0,
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

export type ResponsesEvidence = {
  model: string;
  inferenceProvider: string;
  actualCostUsd?: number;
};

function validResponseModel(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(candidate) ? candidate : fallback;
}

export function resolveResponsesEvidence(
  payload: Record<string, unknown>,
  requestedModel: string,
  transport: RuntimeProviderName,
): ResponsesEvidence {
  const topLevelModel = validResponseModel(payload.model, requestedModel);
  if (transport !== "AI Gateway") {
    return {
      model: topLevelModel,
      inferenceProvider: transport === "OpenAI" ? "openai" : "gateway",
    };
  }

  const baseFallback: ResponsesEvidence = { model: topLevelModel, inferenceProvider: "gateway" };
  const providerMetadata = payload.provider_metadata;
  const gateway =
    providerMetadata && typeof providerMetadata === "object"
      ? (providerMetadata as Record<string, unknown>).gateway
      : undefined;
  if (!gateway || typeof gateway !== "object") return baseFallback;

  // gateway.cost is the authoritative charge for this response and does not
  // depend on routing metadata being complete enough to attribute a specific
  // model/provider pair. Keep truthful cost accounting even when attribution
  // must conservatively fall back to the top-level model and `gateway`.
  const actualCostUsd = normalizeProviderReportedCostUsd((gateway as Record<string, unknown>).cost);
  const fallback: ResponsesEvidence = {
    ...baseFallback,
    ...(actualCostUsd !== undefined ? { actualCostUsd } : {}),
  };

  const routing = (gateway as Record<string, unknown>).routing;
  if (!routing || typeof routing !== "object") return fallback;

  const routingRecord = routing as Record<string, unknown>;
  const finalProviderCandidate =
    typeof routingRecord.finalProvider === "string"
      ? routingRecord.finalProvider.trim().toLowerCase()
      : "";
  if (!/^[a-z0-9][a-z0-9._:/-]{0,99}$/.test(finalProviderCandidate)) return fallback;

  const attempts = Array.isArray(routingRecord.modelAttempts) ? routingRecord.modelAttempts : [];
  const successfulModelAttempts = attempts.filter(
    (attempt) =>
      attempt &&
      typeof attempt === "object" &&
      (attempt as Record<string, unknown>).success === true,
  );
  if (successfulModelAttempts.length !== 1) return fallback;

  const successfulAttempt = successfulModelAttempts[0] as Record<string, unknown>;
  const providerAttempts = Array.isArray(successfulAttempt.providerAttempts)
    ? successfulAttempt.providerAttempts
    : [];
  const successfulProviderAttempts = providerAttempts.filter(
    (providerAttempt) =>
      providerAttempt &&
      typeof providerAttempt === "object" &&
      (providerAttempt as Record<string, unknown>).success === true,
  );
  if (successfulProviderAttempts.length !== 1) return fallback;

  // A provider attempt marked successful under a failed model attempt makes
  // the metadata self-contradictory. Reject the entire tuple instead of
  // accidentally pairing that provider with the one successful model.
  const allSuccessfulProviderAttempts = attempts.flatMap((attempt) => {
    if (!attempt || typeof attempt !== "object") return [];
    const nestedProviderAttempts = (attempt as Record<string, unknown>).providerAttempts;
    if (!Array.isArray(nestedProviderAttempts)) return [];
    return nestedProviderAttempts.filter(
      (providerAttempt) =>
        providerAttempt &&
        typeof providerAttempt === "object" &&
        (providerAttempt as Record<string, unknown>).success === true,
    );
  });
  if (allSuccessfulProviderAttempts.length !== 1) return fallback;

  const successfulProviderAttempt = successfulProviderAttempts[0] as Record<string, unknown>;
  const provider =
    typeof successfulProviderAttempt.provider === "string"
      ? successfulProviderAttempt.provider.trim().toLowerCase()
      : "";
  if (provider !== finalProviderCandidate) return fallback;

  const model = validResponseModel(successfulAttempt.canonicalSlug, "");
  if (!model) return fallback;

  return {
    model,
    inferenceProvider: provider,
    ...(actualCostUsd !== undefined ? { actualCostUsd } : {}),
  };
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
  gatewayModels?: readonly string[];
  store?: boolean;
  safetyIdentifier?: string;
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
          content: responsesInputContent(item.content),
        })),
        max_output_tokens: args.body.max_tokens ?? 4096,
        ...(typeof args.store === "boolean" ? { store: args.store } : {}),
        ...(args.safetyIdentifier ? { safety_identifier: args.safetyIdentifier } : {}),
        ...(args.gatewayModels?.length
          ? {
              providerOptions: {
                gateway: {
                  models: args.gatewayModels,
                  // Keep the continuity route subject to the same no-training
                  // boundary as direct managed-provider traffic.
                  disallowPromptTraining: true,
                },
              },
            }
          : {}),
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
  if (!response.ok) {
    // Provider error bodies may echo customer content. Keep classification and
    // the bounded provider request id, but never copy response bodies into logs.
    // Keep the timeout active through cancellation so a headers-only response
    // cannot strand the request while its unread body stalls.
    try {
      if (response.body) await response.body.cancel().catch(() => undefined);
    } finally {
      timer.dispose();
    }
    const requestId = String(response.headers.get("x-request-id") || "")
      .trim()
      .slice(0, 128);
    log.warn("[ai-runtime] provider request rejected", {
      provider: args.provider,
      status: response.status,
      ...(requestId ? { requestId } : {}),
    });
    if (response.status >= 400 && response.status < 500) {
      throw new DefiniteProviderRejectionError(args.provider, response.status);
    }
    throw new Error(`${args.provider} Responses request failed (${response.status})`);
  }

  let payload: Record<string, unknown>;
  try {
    // fetch() resolves when headers arrive. Keep the same timeout active until
    // the JSON body is fully consumed so a provider cannot hold the worker
    // forever with a headers-then-stalled-body response.
    payload = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    const timedOut = timer.timedOut();
    timer.dispose();
    if (timedOut) {
      throw new Error(
        `${args.provider} Responses request timed out after ${RUNTIME_REQUEST_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  }
  timer.dispose();
  const usage = (payload.usage || {}) as Record<string, unknown>;
  // Responses includes cached and cache-write tokens in input_tokens. Split
  // both details out so the audit layer can apply their actual vendor rates.
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } =
    normalizeResponsesUsage(usage);
  // Gateway model fallbacks are resolved inside one HTTP request. Attribute
  // usage and pricing to the model the provider says actually completed it.
  const evidence = resolveResponsesEvidence(payload, args.model, args.provider);
  const usageResponse = {
    model: evidence.model,
    inference_provider: evidence.inferenceProvider,
    actual_cost_usd: evidence.actualCostUsd,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: cacheReadTokens,
      cache_creation_input_tokens: cacheWriteTokens,
    },
  };
  let text: string;
  let structuredInput: unknown;
  try {
    text = extractResponsesText(payload);
    if (!text) throw new Error("Empty provider output");
    if (tool) structuredInput = parseStructuredJson(text);
  } catch (error) {
    // A 200 response may be incomplete, refused, or contain invalid JSON after
    // generation was billed. Preserve that attempt before provider fallback.
    // Valid responses remain recorded once by the structured-runtime caller.
    if (hasKnownResponsesUsage(usage) || evidence.actualCostUsd !== undefined) {
      recordUsage(args.model, usageResponse, Date.now() - started);
      throw new AccountedProviderOutputError(args.provider);
    }
    throw error;
  }
  // Useful output is still returned when usage is missing, but normalized zero
  // tokens are not proof that generation was free. Spend wrappers keep the hold.
  if (!hasKnownResponsesUsage(usage) && evidence.actualCostUsd === undefined) {
    recordAmbiguousProviderAttempt();
  }
  log.info("[ai-runtime] response complete", {
    provider: args.provider,
    inferenceProvider: evidence.inferenceProvider,
    model: evidence.model,
    latencyMs: Date.now() - started,
    structured: !!tool,
  });

  return tool
    ? message({
        model: evidence.model,
        inferenceProvider: evidence.inferenceProvider,
        actualCostUsd: evidence.actualCostUsd,
        content: [
          {
            type: "tool_use",
            id: `call_${Math.random().toString(36).slice(2)}`,
            caller: { type: "direct" },
            name: tool.name,
            input: structuredInput,
          },
        ],
        stopReason: "tool_use",
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      })
    : message({
        model: evidence.model,
        inferenceProvider: evidence.inferenceProvider,
        actualCostUsd: evidence.actualCostUsd,
        content: [{ type: "text", text, citations: null }],
        stopReason: "end_turn",
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      });
}

async function callGateway(
  body: RuntimeRequest,
  options?: RuntimeRequestOptions,
): Promise<RuntimeMessage> {
  if (!isAIGatewayConfigured()) throw new Error("AI Gateway is not configured");
  const requested = String(body.model || "").trim();
  const primary = gatewayModelId(
    requested ||
      process.env.WIRELINE_GATEWAY_STRUCTURED_MODEL?.trim() ||
      `openai/${OPENAI_STRUCTURED_PRIMARY_MODEL}`,
  );
  const models = [
    primary,
    gatewayModelId(
      process.env.WIRELINE_GATEWAY_OPENAI_MODEL?.trim() ||
        `openai/${OPENAI_STRUCTURED_PRIMARY_MODEL}`,
    ),
    gatewayModelId(
      process.env.WIRELINE_GATEWAY_GEMINI_MODEL?.trim() ||
        `google/${GEMINI_STRUCTURED_FALLBACK_MODEL}`,
    ),
  ].filter((model, index, entries) => model && entries.indexOf(model) === index);
  return callResponsesEndpoint({
    endpoint: `${AI_GATEWAY_BASE_URL}/responses`,
    headers: gatewayHeaders(),
    model: primary,
    gatewayModels: models,
    body,
    options,
    provider: "AI Gateway",
    store: false,
  });
}

function openAISafetyIdentifier(): string | undefined {
  return currentProviderSafetyIdentifier();
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
    store: false,
    safetyIdentifier: openAISafetyIdentifier(),
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
    parts: geminiInputParts(item.content),
  }));
  // Gemini's output cap includes thinking tokens. Carry the same requested
  // bound as Responses so a fallback cannot exceed a setup spend reservation.
  const requestedOutputTokens = body.max_tokens;
  const generationConfig: { responseMimeType?: string; maxOutputTokens: number } = {
    maxOutputTokens:
      typeof requestedOutputTokens === "number" &&
      Number.isFinite(requestedOutputTokens) &&
      requestedOutputTokens > 0
        ? Math.max(1, Math.floor(requestedOutputTokens))
        : 4096,
  };
  if (tool) {
    generationConfig.responseMimeType = "application/json";
    if (contents.length)
      contents[contents.length - 1].parts.push({
        text: `\nReturn one JSON object matching this schema:\n${JSON.stringify(tool.input_schema, null, 2)}`,
      });
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
  const usageMetadata = result.response.usageMetadata as
    import("./ai-audit").GeminiUsageMetadata | undefined;
  // Thinking models report reasoning tokens in thoughtsTokenCount, billed at
  // the output rate but excluded from candidatesTokenCount; context-cache reads
  // sit inside promptTokenCount at the cache-read rate. Fold both in or every
  // Gemini fallback call is under-metered by its full reasoning budget.
  const promptTokens = normalizeUsageTokenCount(usageMetadata?.promptTokenCount);
  const cacheReadTokens = Math.min(
    promptTokens,
    normalizeUsageTokenCount(usageMetadata?.cachedContentTokenCount),
  );
  const inputTokens = promptTokens - cacheReadTokens;
  const outputTokens = saturatingUsageTokenSum(
    usageMetadata?.candidatesTokenCount,
    usageMetadata?.thoughtsTokenCount,
  );
  const response = tool
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
        cacheReadTokens,
      })
    : message({
        model: modelId,
        content: [{ type: "text", text, citations: null }],
        stopReason: "end_turn",
        inputTokens,
        outputTokens,
        cacheReadTokens,
      });
  if (
    !knownTokenCount(usageMetadata?.promptTokenCount) ||
    !knownTokenCount(usageMetadata?.candidatesTokenCount) ||
    (usageMetadata?.thoughtsTokenCount !== undefined &&
      !knownTokenCount(usageMetadata.thoughtsTokenCount)) ||
    (usageMetadata?.cachedContentTokenCount !== undefined &&
      (!knownTokenCount(usageMetadata.cachedContentTokenCount) ||
        usageMetadata.cachedContentTokenCount > promptTokens))
  ) {
    recordAmbiguousProviderAttempt();
  }
  return response;
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
      error: safeProviderErrorLabel(error),
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

const gatewayCircuitBreaker = new RuntimeCircuitBreaker("AI Gateway");
const openAICircuitBreaker = new RuntimeCircuitBreaker("OpenAI");
const geminiCircuitBreaker = new RuntimeCircuitBreaker("Gemini");

/**
 * Transport registry keyed by policy id. The policy module decides which of
 * these are eligible and in what order; this table only says how to reach each
 * one, so a routing change never has to touch fetch code.
 */
const RUNTIME_PROVIDER_REGISTRY: Record<
  ReasoningProviderId,
  { provider: RuntimeProvider; available: () => boolean }
> = {
  openai: {
    provider: { name: "OpenAI", call: callOpenAI, breaker: openAICircuitBreaker },
    available: () => Boolean(process.env.OPENAI_API_KEY),
  },
  gemini: {
    provider: { name: "Gemini", call: callGemini, breaker: geminiCircuitBreaker },
    available: () => Boolean(process.env.GEMINI_API_KEY),
  },
  gateway: {
    provider: { name: "AI Gateway", call: callGateway, breaker: gatewayCircuitBreaker },
    available: () => isAIGatewayConfigured(),
  },
};

function configuredProviders(): RuntimeProvider[] {
  const available = (Object.keys(RUNTIME_PROVIDER_REGISTRY) as ReasoningProviderId[]).filter((id) =>
    RUNTIME_PROVIDER_REGISTRY[id].available(),
  );
  return orderReasoningProviders(available, resolveReasoningPreference()).map(
    (id) => RUNTIME_PROVIDER_REGISTRY[id].provider,
  );
}

function nextAvailableProvider(
  providers: RuntimeProvider[],
  currentIndex: number,
): RuntimeProvider | undefined {
  return providers.slice(currentIndex + 1).find((provider) => !provider.breaker?.isOpen());
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
      const definiteRejection = definiteProviderRejection(error, provider.name);
      if (isAbortError(error, options?.signal)) {
        // Cancellation does not prove an already-submitted provider request
        // stopped billing. This also preserves the hold after an earlier lane
        // recorded known usage and the next in-flight fallback was aborted.
        if (!definiteRejection && !(error instanceof AccountedProviderOutputError)) {
          recordAmbiguousProviderAttempt();
        }
        throw error;
      }
      const providerError = definiteRejection ?? error;
      if (!definiteRejection && !(error instanceof AccountedProviderOutputError)) {
        // The request crossed a provider boundary, but no usage response came
        // back. It may still be billable (notably Gemini's non-cancelable SDK
        // timeout), so cost wrappers must retain their conservative hold.
        recordAmbiguousProviderAttempt();
      }
      provider.breaker?.recordFailure(providerError);
      lastError = providerError;
      const next = nextAvailableProvider(providers, index);
      if (next)
        log.warn("[ai-runtime] provider request failed; trying fallback", {
          provider: provider.name,
          nextProvider: next.name,
          error: safeProviderErrorLabel(providerError),
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

export const isRuntimeAvailable = () => configuredProviders().length > 0;

/**
 * Operator-facing view of the resolved chain. Names only — never credentials,
 * endpoints, or model ids — so this is safe to surface on a status route.
 */
export const describeRuntimeChain = (): RuntimeProviderName[] =>
  configuredProviders().map((provider) => provider.name);
