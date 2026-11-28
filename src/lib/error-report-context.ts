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

/**
 * Where each of those components lives: the built file and the position in it,
 * innermost first, in step with `componentTrail`. A production build shortens
 * component names to a letter or two, so the names alone say little; the file
 * and position can be read back against a build of the released commit. A
 * frame with no built file is kept as `?`, so the two lists stay aligned. Only
 * the file's name is kept: no origin, path or query.
 */
export function componentPlaces(componentStack: unknown): string | undefined {
  if (typeof componentStack !== "string") return undefined;
  const places = componentStack
    .split(/\r?\n/)
    .filter((line) => {
      const name = /^\s*at\s+([A-Za-z_$][\w$.]*)/.exec(line)?.[1] ?? "";
      return name && name !== "https" && name !== "http";
    })
    .map((line) => {
      const place = /\/([\w.-]+?)\.(?:m?js|tsx?)(?:\?[^\s:)]*)?:(\d+):(\d+)\)?\s*$/.exec(line);
      return place ? `${place[1]}:${place[2]}:${place[3]}` : "?";
    });
  if (!places.some((place) => place !== "?")) return undefined;
  return places.slice(0, 40).join(" < ").slice(0, 1_600);
}
