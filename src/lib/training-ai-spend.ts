import { gatewayModelId, isAIGatewayConfigured } from "./ai-gateway";
import {
  bareModelId,
  DEFAULT_MODEL,
  MODEL_PRICING,
  OPENAI_MODELS,
  OPENAI_STRUCTURED_PRIMARY_MODEL,
  pricingForModel,
  selectModelForTask,
  XAI_STRUCTURED_PRIMARY_MODEL,
} from "./ai-models";
import { RuntimeUnavailableError } from "./ai-client";
import { runStructured, type StructuredOptions } from "./ai-structured";
import { AppError } from "./api-error";
import { runWithManagedAiSpend } from "./managed-ai-operation-spend";
import { runWithWebsiteKnowledgeExtractionTimeout } from "./website-knowledge-timeout";

// One token per UTF-8 byte bounds the rendered text conservatively. Include the
// pretty-printed schema and 2,048 tokens for the adapters' fixed message/schema
// framing. Never estimate customer text using chars / 4.
const ADAPTER_FRAMING_TOKENS = 2048;
const LEDGER_PRECISION = 1_000_000;

export function trainingAttemptModels(requestedModel: string): string[] {
  const models: string[] = [];
  // Mirror the runtime chain: xAI first, then OpenAI, then the legacy Gateway.
  if (process.env.XAI_API_KEY?.trim()) {
    models.push(/^grok-/i.test(requestedModel) ? requestedModel : XAI_STRUCTURED_PRIMARY_MODEL);
  }
  if (process.env.OPENAI_API_KEY) {
    models.push(
      requestedModel.startsWith("gpt-") ? requestedModel : OPENAI_STRUCTURED_PRIMARY_MODEL,
    );
  }
  if (isAIGatewayConfigured()) {
    // Mirror callGateway's explicit, deduplicated fallback list. Sum lanes, not
    // their maximum: an unusable billed response can precede a working fallback.
    models.push(
      ...new Set([
        gatewayModelId(
          requestedModel ||
            process.env.WIRELINE_GATEWAY_STRUCTURED_MODEL?.trim() ||
            `openai/${OPENAI_STRUCTURED_PRIMARY_MODEL}`,
        ),
        gatewayModelId(
          process.env.WIRELINE_GATEWAY_OPENAI_MODEL?.trim() ||
            `openai/${OPENAI_STRUCTURED_PRIMARY_MODEL}`,
        ),
      ]),
    );
  }
  if (!models.length) throw new RuntimeUnavailableError();
  return models;
}

export function boundedTrainingReserveUsd(input: {
  text: string;
  models: readonly string[];
  maxOutputTokens: number;
  imageTokens?: number;
}): number {
  if (
    !Number.isSafeInteger(input.maxOutputTokens) ||
    input.maxOutputTokens <= 0 ||
    !input.models.length
  ) {
    throw new AppError(
      503,
      "AI_SPEND_BOUND_UNAVAILABLE",
      "AI training is temporarily unavailable. Try again shortly.",
    );
  }
  const inputTokens =
    Buffer.byteLength(input.text, "utf8") + ADAPTER_FRAMING_TOKENS + (input.imageTokens || 0);
  let totalUsd = 0;
  for (const model of input.models) {
    const bare = bareModelId(model);
    // pricingForModel intentionally estimates unknown historical records. It
    // must not silently authorize new spend using a cheaper fallback rate.
    if (
      !Object.hasOwn(MODEL_PRICING, bare) ||
      (model.includes("/") && !/^(openai\/gpt-|google\/gemini)/.test(model))
    ) {
      throw new AppError(
        503,
        "AI_SPEND_BOUND_UNAVAILABLE",
        "AI training is temporarily unavailable. Try again shortly.",
      );
    }
    const rates = pricingForModel(model, inputTokens);
    totalUsd +=
      (inputTokens * Math.max(rates.input, rates.cacheWrite) +
        input.maxOutputTokens * rates.output) /
      LEDGER_PRECISION;
  }
  return Math.ceil(totalUsd * LEDGER_PRECISION) / LEDGER_PRECISION;
}

export async function runTrainingStructured<T>(input: {
  userId: string;
  source: "training" | "asset_text" | "google_drive" | "website";
  hostname?: string;
  options: StructuredOptions;
}): Promise<T> {
  const { options } = input;
  const model =
    options.model ?? (options.complexity ? selectModelForTask(options.complexity) : DEFAULT_MODEL);
  const reserveUsd = boundedTrainingReserveUsd({
    text: JSON.stringify(
      { system: options.system, user: options.user, tool: options.tool },
      null,
      2,
    ),
    models: trainingAttemptModels(model),
    maxOutputTokens: options.maxTokens ?? 4096,
  });
  return runWithManagedAiSpend({
    userId: input.userId,
    action: input.source === "website" ? "website-knowledge.import" : `training.${input.source}`,
    model: "bounded_training_extraction",
    reserveUsd,
    requestMeta: { source: input.source },
    hostname: input.hostname,
    operation: () =>
      input.source === "website"
        ? runWithWebsiteKnowledgeExtractionTimeout((signal) =>
            runStructured<T>({ ...options, signal }),
          )
        : runStructured<T>(options),
  });
}

function isBoundedVisionModel(model: string): boolean {
  return (
    model.startsWith("openai/") &&
    (
      [
        OPENAI_MODELS.GPT_5_6_TERRA,
        OPENAI_MODELS.GPT_5_6_LUNA,
        OPENAI_MODELS.GPT_5_6_SOL,
      ] as string[]
    ).includes(bareModelId(model))
  );
}

export function isTrainingImageAvailable(): boolean {
  return (
    isAIGatewayConfigured() &&
    isBoundedVisionModel(gatewayModelId(process.env.WIRELINE_GATEWAY_VISION_MODEL?.trim() || ""))
  );
}

export async function runTrainingImage<T>(input: {
  userId: string;
  model: string;
  promptAndSchema: string;
  operation: () => Promise<T>;
}): Promise<T> {
  if (!isAIGatewayConfigured()) throw new RuntimeUnavailableError();
  // Low detail on the GPT-5.6 family fits 512x512: 16x16 patches x1.2,
  // rounded up. Do not apply that image-token bound to arbitrary overrides.
  // https://developers.openai.com/api/docs/guides/images-vision
  if (!isBoundedVisionModel(input.model)) {
    throw new AppError(
      503,
      "AI_SPEND_BOUND_UNAVAILABLE",
      "Image training is temporarily unavailable. Text training is still available.",
    );
  }
  return runWithManagedAiSpend({
    userId: input.userId,
    action: "training.asset_image",
    model: input.model,
    reserveUsd: boundedTrainingReserveUsd({
      text: input.promptAndSchema,
      models: [input.model],
      maxOutputTokens: 1200,
      imageTokens: 308,
    }),
    requestMeta: { source: "asset_image" },
    operation: input.operation,
  });
}
