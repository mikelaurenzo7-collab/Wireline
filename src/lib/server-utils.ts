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
 * Recursively redact sensitive fields from an arbitrary object before
 * persisting to the audit log. The audit trail is queryable by
 * non-engineers, so credentials must never reach it.
 *
 * Matches case-insensitive substrings: "key", "secret", "password",
 * "token", "credential", "auth". Returns a new object — does NOT mutate.
 */
export function sanitizeForAudit(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;

  const sensitivePatterns = [
    "key",
    "secret",
    "password",
    "token",
    "credential",
    "auth",
  ];

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
