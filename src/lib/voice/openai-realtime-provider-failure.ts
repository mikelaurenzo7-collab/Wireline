export type OpenAIRealtimeProviderFailure = {
  status: number | null;
  requestId: string | null;
  errorCode: string;
};

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function normalizedErrorCode(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "provider_error";
}

function responseRequestId(response: Response): string | null {
  const candidate = (
    response.headers.get("x-request-id") ||
    response.headers.get("request-id") ||
    ""
  ).trim();
  return SAFE_REQUEST_ID.test(candidate) ? candidate : null;
}

/**
 * Produce the only provider-controlled metadata allowed to cross an OpenAI
 * Realtime failure boundary. Response bodies are deliberately not accepted by
 * this API, so a caller cannot accidentally place provider messages, account
 * identifiers, or echoed request data into logs or durable job errors.
 */
export function openAIRealtimeProviderFailure(
  response: Response,
  errorCode: string,
): OpenAIRealtimeProviderFailure {
  return {
    status: response.status,
    requestId: responseRequestId(response),
    errorCode: normalizedErrorCode(errorCode),
  };
}

/**
 * A 4xx response is a definitive provider rejection. A 5xx can happen after
 * upstream call creation but before the response reaches BotBound, so cost and
 * quota reservations must remain conservative for that ambiguous outcome.
 */
export function openAIRealtimeCallMayExistAfterResponse(response: Response): boolean {
  return response.status >= 500;
}

export function openAIRealtimeInternalFailure(errorCode: string): OpenAIRealtimeProviderFailure {
  return {
    status: null,
    requestId: null,
    errorCode: normalizedErrorCode(errorCode),
  };
}

export class OpenAIRealtimeProviderError extends Error {
  readonly failure: OpenAIRealtimeProviderFailure;

  constructor(operation: string, failure: OpenAIRealtimeProviderFailure) {
    super(
      `${operation} failed (status=${failure.status ?? "unavailable"}, request_id=${failure.requestId ?? "unavailable"}, error_code=${failure.errorCode})`,
    );
    this.name = "OpenAIRealtimeProviderError";
    this.failure = failure;
  }
}

export function openAIRealtimeFailureFromError(
  error: unknown,
  fallbackCode: string,
): OpenAIRealtimeProviderFailure {
  return error instanceof OpenAIRealtimeProviderError
    ? error.failure
    : openAIRealtimeInternalFailure(fallbackCode);
}

export function openAIRealtimeFailureLogFields(failure: OpenAIRealtimeProviderFailure): {
  status: number | null;
  requestId: string | null;
  errorCode: string;
} {
  return {
    status: failure.status,
    requestId: failure.requestId,
    errorCode: failure.errorCode,
  };
}
