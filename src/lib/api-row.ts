/**
 * Read fields from API JSON rows that may use snake_case (SPA convention)
 * or camelCase (Drizzle default) depending on route age / deploy.
 */
export function apiField<T = unknown>(
  row: Record<string, unknown> | null | undefined,
  snake: string,
): T | undefined {
  if (!row) return undefined;
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return (row[snake] ?? row[camel]) as T | undefined;
}

export function apiStr(
  row: Record<string, unknown> | null | undefined,
  snake: string,
  fallback = "",
): string {
  const v = apiField<string>(row, snake);
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export function apiNum(
  row: Record<string, unknown> | null | undefined,
  snake: string,
  fallback = 0,
): number {
  const v = apiField<number>(row, snake);
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
