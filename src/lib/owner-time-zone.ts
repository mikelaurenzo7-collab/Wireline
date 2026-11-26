/**
 * The zone a new Bot starts in when its creator sent none.
 *
 * The web create form sends the browser's zone. A Bot drafted from a connected
 * app or the mobile app has no browser zone to send, and the column default is
 * UTC, which leaves that Bot telling callers the wrong time of day and the
 * wrong "today". The owner's other Bots are the evidence of where they work.
 */

/** A saved zone that says something: UTC is the column default, not a choice. */
export function chosenTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const zone = value.trim();
  if (!zone || zone === "UTC" || zone === "Etc/UTC") return undefined;
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions()
      .timeZone;
    return resolved === "UTC" || resolved === "Etc/UTC" ? undefined : resolved;
  } catch {
    return undefined;
  }
}

/** The zone most of the owner's Bots use. Ties resolve alphabetically so repeats agree. */
export function mostUsedTimeZone(values: readonly unknown[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    const zone = chosenTimeZone(value);
    if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}
