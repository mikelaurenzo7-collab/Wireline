/**
 * Structured logger + prod flag with **no** Node-only dependencies.
 * Imported by the browser (e.g. Command Center) as well as the API bundle.
 */

export const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

type LogLevel = "debug" | "info" | "warn" | "error";

function emitLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(fields || {}) };
  if (IS_PROD) {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      JSON.stringify(entry),
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
