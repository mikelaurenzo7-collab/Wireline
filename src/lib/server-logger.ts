// Structured logger + prod flag with no Node-only dependencies.
// Imported by browser code (e.g. Recaps) as well as the API bundle.

export const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

type LogLevel = "debug" | "info" | "warn" | "error";

type RequestIdReader = () => string | undefined;
let readRequestId: RequestIdReader | null = null;

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
  const requestId =
    (typeof fields?.requestId === "string" ? fields.requestId : undefined) ?? readRequestId?.();
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(requestId ? { requestId } : {}),
    ...(fields || {}),
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
