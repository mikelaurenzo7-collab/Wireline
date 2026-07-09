/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
// Pure server-side utilities — extracted from server.ts so they can be
// unit-tested without spinning up the Express app. All functions here
// must be deterministic and side-effect-free.

/**
 * Safely extract a human-readable message from an unknown error value.
 * Avoids `[object Object]` strings when something other than an Error
 * is thrown (e.g. a plain string or a non-Error object from a third-party SDK).
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
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
