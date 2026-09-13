import { sanitizeErrorMessage } from "./server-utils";

/** Shared browser/server boundary for bounded developer diagnostic labels. */
export function errorReportContext(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const context = value as Record<string, unknown>;
  const safe: Record<string, string> = {};
  for (const key of ["errorClass", "widget", "source", "componentStack"] as const) {
    if (typeof context[key] !== "string") continue;
    safe[key] = sanitizeErrorMessage(context[key]).slice(0, key === "componentStack" ? 2_000 : 80);
  }
  return safe;
}
