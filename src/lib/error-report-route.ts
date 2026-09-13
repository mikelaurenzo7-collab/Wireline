import { sanitizeErrorMessage } from "./server-utils";

/** Route diagnostics never need URL credentials, query values, or fragments. */
export function errorReportRoute(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 8_192) return undefined;
  const url = value.trim();
  const relativePath = /^\/(?![\\/])/.test(url);
  if (!relativePath && !/^https?:\/\//i.test(url)) return undefined;
  try {
    // A fixed, non-routable base also accepts path-only reports from new clients;
    // absolute URLs from older clients are normalized at the server boundary.
    const parsed = new URL(url, "https://telemetry.invalid");
    return sanitizeErrorMessage(parsed.pathname).slice(0, 500);
  } catch {
    return undefined;
  }
}
