const FALLBACK_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;

/** Time zone choices for a picker: UTC, the saved zone, then every zone the browser knows. */
export function timeZoneOptions(current: string): string[] {
  try {
    return [...new Set(["UTC", current, ...Intl.supportedValuesOf("timeZone")])];
  } catch {
    return [...new Set([current, "UTC", ...FALLBACK_TIME_ZONES])];
  }
}

/** The viewer's own time zone, or null when the browser does not report one. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
