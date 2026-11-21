/** Local calendar date as YYYY-MM-DD — avoids UTC drift in "today" filters. */
export function localDateKey(value: Date, timeZone?: string): string {
  if (Number.isNaN(value.getTime())) return "";
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(value);
      const { year, month, day } = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${year.padStart(4, "0")}-${month}-${day}`;
    } catch {
      return "";
    }
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoToLocalDateKey(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  return localDateKey(new Date(iso), timeZone);
}
