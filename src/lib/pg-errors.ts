/**
 * Walk Drizzle / node-postgres error chains for a Postgres SQLSTATE code.
 * Drizzle wraps failures in DrizzleQueryError; the code may live on
 * `error.code`, `error.cause.code`, or deeper.
 */
export function getPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (current && typeof current === "object" && "code" in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && code.length > 0) return code;
    }
    current =
      current && typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return undefined;
}
