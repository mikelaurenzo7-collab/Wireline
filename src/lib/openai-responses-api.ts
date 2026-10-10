import { DefiniteProviderRejectionError, RuntimeUnavailableError } from "./ai-client";
import { recordAmbiguousProviderAttempt } from "./ai-audit";

export type OpenAIResponsesResponse = {
  id?: string;
  model?: string;
  status?: string;
  output?: unknown;
  output_text?: string;
  usage?: Record<string, unknown>;
  error?: unknown;
  incomplete_details?: unknown;
};

async function openAIResponsesPost<T>(
  path: "/responses" | "/responses/input_tokens",
  body: Record<string, unknown>,
  timeoutMs: number,
  trackAmbiguousGeneration = true,
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new RuntimeUnavailableError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`https://api.openai.com/v1${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      if (trackAmbiguousGeneration) recordAmbiguousProviderAttempt();
      throw new RuntimeUnavailableError();
    }

    if (!response.ok) {
      if (
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 429].includes(response.status)
      ) {
        throw new DefiniteProviderRejectionError("OpenAI", response.status);
      }
      if (trackAmbiguousGeneration && (response.status === 408 || response.status >= 500)) {
        recordAmbiguousProviderAttempt();
      }
      throw new RuntimeUnavailableError();
    }

    try {
      return (await response.json()) as T;
    } catch {
      // A generation may have completed even when its response could not be read.
      if (trackAmbiguousGeneration) recordAmbiguousProviderAttempt();
      throw new RuntimeUnavailableError();
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Direct Responses API call with retries left to the caller's spend meter. */
export function openAIResponsesCreate(
  body: Record<string, unknown>,
  timeoutMs = 300_000,
): Promise<OpenAIResponsesResponse> {
  return openAIResponsesPost<OpenAIResponsesResponse>("/responses", body, timeoutMs);
}

/** Count the exact model input, including files and structured-output schemas. */
export async function openAIResponsesInputTokensCount(
  body: Record<string, unknown>,
  timeoutMs = 300_000,
): Promise<number> {
  const response = await openAIResponsesPost<{ input_tokens?: unknown }>(
    "/responses/input_tokens",
    body,
    timeoutMs,
    false,
  );
  if (
    typeof response.input_tokens !== "number" ||
    !Number.isSafeInteger(response.input_tokens) ||
    response.input_tokens < 0
  ) {
    throw new RuntimeUnavailableError();
  }
  return Number(response.input_tokens);
}
