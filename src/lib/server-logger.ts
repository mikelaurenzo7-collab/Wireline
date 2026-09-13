// Structured logger + prod flag with no Node-only dependencies.
// Imported by browser code (e.g. Recaps) as well as the API bundle.

import { sanitizeErrorMessage } from "./server-utils";

export const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

type LogLevel = "debug" | "info" | "warn" | "error";

type RequestIdReader = () => string | undefined;
let readRequestId: RequestIdReader | null = null;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,63}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|passwordhash/i;

function sanitizeString(value: string, key: string): string {
  if (
    (key === "error" || key === "message" || /error$/i.test(key)) &&
    /failed query:|\bparams?:/i.test(value)
  ) {
    return "Database operation failed [detail redacted]";
  }
  const sanitized = sanitizeErrorMessage(value)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(BEARER_PATTERN, "Bearer [redacted]");
  return sanitized.length > 4_000 ? `${sanitized.slice(0, 4_000)} [truncated]` : sanitized;
}

function sanitizeValue(value: unknown, key: string, seen: WeakSet<object>): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  if (typeof value === "string") return sanitizeString(value, key);
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    const vendorCode = (value as Error & { code?: unknown }).code;
    return {
      name: value.name || "Error",
      message: sanitizeString(value.message || "Unexpected error", "error"),
      ...(typeof vendorCode === "string" || typeof vendorCode === "number"
        ? { code: sanitizeString(String(vendorCode), "code") }
        : {}),
    };
  }
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key, seen));
  }
  const safe: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    safe[childKey] = sanitizeValue(childValue, childKey, seen);
  }
  return safe;
}

export function sanitizeLogFieldsForProduction(
  fields?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!fields) return undefined;
  return sanitizeValue(fields, "fields", new WeakSet<object>()) as Record<string, unknown>;
}

/** Server bootstrap only — binds ALS requestId into every log line. */
export function bindRequestIdReader(reader: RequestIdReader): void {
  readRequestId = reader;
}

function safeStringify(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj);
  } catch {
    // Fallback: strip non-serializable fields
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      try {
        JSON.stringify(v);
        safe[k] = v;
      } catch {
        safe[k] = "[unserializable]";
      }
    }
    return JSON.stringify(safe);
  }
}

function emitLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const safeFields = IS_PROD ? sanitizeLogFieldsForProduction(fields) : fields;
  const requestId =
    (typeof safeFields?.requestId === "string" ? safeFields.requestId : undefined) ??
    readRequestId?.();
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(requestId ? { requestId } : {}),
    ...(safeFields || {}),
  };
  if (IS_PROD) {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      safeStringify(entry),
    );
  } else {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      `[${level}]`,
      msg,
      fields ?? "",
    );
  }
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emitLog("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emitLog("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emitLog("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emitLog("error", msg, fields),
};
