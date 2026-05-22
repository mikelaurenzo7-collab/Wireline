/* eslint-disable no-console -- logger.ts IS the console sink; emitLog must call console.* directly. */
export const IS_PROD =
  typeof process !== "undefined"
    ? process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
    : true;

type LogLevel = "debug" | "info" | "warn" | "error";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return undefined;
}

function emitLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const entry: any = { ts: new Date().toISOString(), level, msg, ...(fields || {}) };

  if (fields?.error) {
    entry.error_message = getErrorMessage(fields.error);
    entry.error_stack = getErrorStack(fields.error);
    if (typeof entry.error === "object") delete entry.error;
  }

  if (IS_PROD) {
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      JSON.stringify(entry),
    );
  } else {
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
