/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
// Pure server-side utilities — extracted from server.ts so they can be
// unit-tested without spinning up the Express app. All functions here
// must be deterministic and side-effect-free.

/**
 * Production errors can contain Drizzle's bound params or provider payloads.
 * Those values routinely include tenant UUIDs, email addresses, bearer tokens,
 * and signed query values. Keep the useful failure shape while ensuring those
 * identifiers never cross the structured-log boundary.
 */
const MAX_ERROR_MESSAGE_LENGTH = 2_000;
/**
 * Redaction runs on every error path, over text this process does not control
 * (provider bodies, driver messages, values echoed back from user input). Two
 * things keep that from becoming a denial-of-service on the single event loop:
 * this scan window, and the bounded quantifiers below. The result is capped at
 * MAX_ERROR_MESSAGE_LENGTH regardless, so nothing past the window could have
 * survived into the log anyway.
 */
const MAX_ERROR_SCAN_LENGTH = 8_000;
const DRIZZLE_PARAMS_RE = /(\r?\nparams:)[\s\S]*$/i;
/**
 * Quantifiers are bounded at RFC-realistic lengths (local part 64, domain 255,
 * TLD 24). Unbounded `+` runs backtrack quadratically against a long stretch of
 * address-shaped characters that never reaches an `@`, which is exactly what a
 * large echoed string looks like: 16 KB took ~300 ms, 1 MB took ~19 minutes.
 * The bounded form is linear and matches the same addresses.
 */
const EMAIL_IN_ERROR_RE = /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}\b/gi;
const UUID_IN_ERROR_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const AUTH_IN_ERROR_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi;
const SECRET_QUERY_VALUE_RE =
  /([?&](?:access_token|auth|authorization|code|credential|key|password|secret|signature|token)=)[^&#\s]+/gi;

export function sanitizeErrorMessage(message: string): string {
  const overScanWindow = message.length > MAX_ERROR_SCAN_LENGTH;
  const sanitized = (overScanWindow ? message.slice(0, MAX_ERROR_SCAN_LENGTH) : message)
    .replace(DRIZZLE_PARAMS_RE, "$1 [redacted-params]")
    .replace(EMAIL_IN_ERROR_RE, "[redacted-email]")
    .replace(UUID_IN_ERROR_RE, "[redacted-id]")
    .replace(AUTH_IN_ERROR_RE, "$1 [REDACTED]")
    .replace(SECRET_QUERY_VALUE_RE, "$1[REDACTED]");

  if (!overScanWindow && sanitized.length <= MAX_ERROR_MESSAGE_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…[truncated]`;
}

/**
 * Safely extract a bounded, log-safe human-readable message from an unknown
 * error value. Avoids `[object Object]` strings when something other than an
 * Error is thrown while preserving enough context to diagnose the failure.
 */
export function getErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  return sanitizeErrorMessage(message);
}

/**
 * Coerce Postgres bigint / numeric IDs into JSON-safe strings.
 * Raw JS BigInt values throw on JSON.stringify and break jsonb inserts.
 */
export function jsonSafeId(id: bigint | number | string | null | undefined): string | null {
  if (id == null || id === "") return null;
  return String(id);
}

/**
 * Deep-clone a value into a JSON-serializable shape (BigInt → string).
 * Use before writing objects into jsonb columns or structured logs.
 */
export function toJsonbSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)),
  ) as T;
}

/**
 * Recursively redact sensitive fields from an arbitrary object before
 * persisting to the audit log. The audit trail is queryable by
 * non-engineers, so credentials must never reach it.
 *
 * Matches case-insensitive substrings: "key", "secret", "password",
 * "token", "credential", "auth". Returns a new object — does NOT mutate.
 */
export function sanitizeForAudit(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;

  const sensitivePatterns = ["key", "secret", "password", "token", "credential", "auth"];

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForAudit(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitivePatterns.some((pattern) => keyLower.includes(pattern));

    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeForAudit(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Verify a user owns a row in `table` matched by id. Returns true if the
 * row exists AND belongs to userId, false otherwise.
 *
 * Used at the top of mutation handlers that take an :id param OR an id
 * from the body and would otherwise let a user touch another user's row.
 *
 * Caller is expected to short-circuit on false:
 *
 *   if (!await ownsRow(db, 'wireline_agents', agentId, userId)) {
 *     return res.status(404).json({ error: 'Agent not found' });
 *   }
 *
 * The `db` parameter is typed loosely so it works with both the Supabase
 * client this server uses and the test mocks in /src/lib tests.
 */
/**
 * Recursively convert object keys from snake_case to camelCase.
 * Useful for mapping frontend payloads to Drizzle/TS internal keys.
 */
export function mapObjectToCamel(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(mapObjectToCamel);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    result[camelKey] = mapObjectToCamel(value);
  }
  return result;
}

/**
 * Inverse of mapObjectToCamel — converts camelCase keys to snake_case
 * recursively. Used at API boundaries to give the SPA the
 * `customer_name` / `created_at` / `event_type` shape it expects,
 * since the React UI is snake_case throughout but Drizzle hands us
 * camelCase columns.
 *
 * Date objects are stringified to ISO so JSON.stringify doesn't drop
 * timezone offsets. BigInt is coerced to string to dodge JSON.stringify
 * crashes on PostgreSQL bigint columns.
 */
export function mapObjectToSnake(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (typeof obj === "bigint") return obj.toString();
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(mapObjectToSnake);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, (g) => `_${g[0].toLowerCase()}`);
    result[snakeKey] = mapObjectToSnake(value);
  }
  return result;
}

export async function ownsRow(
  db: { from: (table: string) => any },
  table: string,
  id: string | number,
  userId: string,
): Promise<boolean> {
  const { data } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}
