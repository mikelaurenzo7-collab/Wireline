/** Admission diagnostics never include exception messages, request bodies or saved prompts. */
const ERROR_CLASSES = new Set([
  "Error",
  "AppError",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "AbortError",
  "TimeoutError",
  "RestException",
  "DatabaseError",
  "PostgresError",
]);
const MAX_PROVIDER_ERROR_BYTES = 8_192;
const PROVIDER_ERROR_READ_TIMEOUT_MS = 750;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function machineField(value: unknown, pattern: RegExp): string | undefined {
  if (typeof value !== "string" || !pattern.test(value)) return undefined;
  if (/(?:sk[-_]|whsec[-_]|bearer|password|secret|credential)/i.test(value)) return undefined;
  return value;
}

export function safeVoiceAdmissionError(error: unknown): Record<string, string | number> {
  const input = record(error);
  // Twilio's RestException inherits name="Error", so prefer a known constructor.
  const constructorName = error instanceof Error ? error.constructor.name : undefined;
  const name =
    constructorName && ERROR_CLASSES.has(constructorName) && constructorName !== "Error"
      ? constructorName
      : typeof input.name === "string" && ERROR_CLASSES.has(input.name)
        ? input.name
        : error instanceof Error
          ? "Error"
          : "NonError";
  const status = Number(input.statusCode ?? input.status);
  const code =
    typeof input.code === "number" &&
    Number.isSafeInteger(input.code) &&
    input.code >= 0 &&
    input.code <= 999_999
      ? input.code
      : machineField(input.code, /^(?:[A-Z][A-Z0-9_]{1,63}|[0-9A-Z]{5})$/);
  return {
    error_class: name,
    http_status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 503,
    ...(code !== undefined ? { error_code: code } : {}),
  };
}

/** Reading a rejected response is byte/time bounded and can never replace the original error. */
export async function openAIAcceptFailureDiagnostics(response: Response) {
  const fields: Record<string, string | number> = { http_status: response.status };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const requestId = machineField(
      response.headers?.get("x-request-id"),
      /^req_[A-Za-z0-9_-]{8,100}$/,
    );
    if (requestId) fields.provider_request_id = requestId;
    const contentLength = Number(response.headers?.get("content-length"));
    if (contentLength > MAX_PROVIDER_ERROR_BYTES) {
      fields.provider_error_body = "too_large";
      void response.body?.cancel().catch(() => {});
      return fields;
    }
    reader = response.body?.getReader();
    if (!reader) {
      fields.provider_error_body = "unavailable";
      return fields;
    }
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader!.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_PROVIDER_ERROR_BYTES) return { state: "too_large" } as const;
        chunks.push(chunk.value);
      }
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const error = record(record(JSON.parse(new TextDecoder().decode(body))).error);
      return { state: "parsed", error } as const;
    };
    const result = await Promise.race([
      read(),
      new Promise<{ state: "timeout" }>((resolve) => {
        timeout = setTimeout(() => resolve({ state: "timeout" }), PROVIDER_ERROR_READ_TIMEOUT_MS);
      }),
    ]);
    fields.provider_error_body = result.state;
    if (result.state === "parsed") {
      const code = machineField(result.error.code, /^[a-z][a-z0-9_]{0,63}$/);
      const type = machineField(result.error.type, /^[a-z][a-z0-9_]{0,63}$/);
      const param = machineField(
        result.error.param,
        /^[A-Za-z_][A-Za-z0-9_]*(?:\[\d{1,3}\])?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\d{1,3}\])?){0,8}$/,
      );
      if (code) fields.provider_error_code = code;
      if (type) fields.provider_error_type = type;
      if (param && param.length <= 160) fields.provider_error_param = param;
    }
  } catch {
    fields.provider_error_body = "unreadable";
  } finally {
    if (timeout) clearTimeout(timeout);
    // Do not wait for an unresponsive provider stream to acknowledge cancellation.
    void reader?.cancel().catch(() => {});
  }
  return fields;
}
