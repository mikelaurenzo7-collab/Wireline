/** Local calendar date as YYYY-MM-DD — avoids UTC drift in "today" filters. */
export function localDateKey(value: Date): string {
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoToLocalDateKey(iso: string | null | undefined): string {
  if (!iso) return "";
  return localDateKey(new Date(iso));
}
