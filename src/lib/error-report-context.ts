import { sanitizeErrorMessage } from "./server-utils";

/** Shared browser/server boundary for bounded developer diagnostic labels. */
export function errorReportContext(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const context = value as Record<string, unknown>;
  const safe: Record<string, string> = {};
  for (const key of ["errorClass", "widget", "source", "componentStack"] as const) {
    if (typeof context[key] !== "string") continue;
    // A component stack runs about 75 characters a frame; 4,000 keeps the
    // fifty or so frames between a crashed primitive and its screen.
    safe[key] =
      key === "componentStack"
        ? sanitizeErrorMessage(context[key], 4_000).slice(0, 4_000)
        : sanitizeErrorMessage(context[key]).slice(0, 80);
  }
  return safe;
}

/**
 * The chain of components a screen crashed under, innermost first, as names
 * only. The top frames of a crash are often a shared primitive (a dialog, a
 * tooltip) that says nothing about which screen was open; the chain does.
 */
export function componentTrail(componentStack: unknown): string | undefined {
  if (typeof componentStack !== "string") return undefined;
  const names = componentStack
    .split(/\r?\n/)
    .map((line) => /^\s*at\s+([A-Za-z_$][\w$.]*)/.exec(line)?.[1] ?? "")
    .filter((name) => name && name !== "https" && name !== "http");
  return names.length ? names.slice(0, 40).join(" < ").slice(0, 900) : undefined;
}
