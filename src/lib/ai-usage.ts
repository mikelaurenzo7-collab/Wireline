/** PostgreSQL `integer` ceiling used by every persisted token-count column. */
export const POSTGRES_INT32_MAX = 2_147_483_647;
const POSTGRES_INT32_MAX_DECIMAL = String(POSTGRES_INT32_MAX);

/** Convert one provider token count into a finite, nonnegative PostgreSQL integer. */
export function normalizeUsageTokenCount(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(POSTGRES_INT32_MAX, Math.floor(value));
  }
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) return 0;
  if (value === "0") return 0;
  if (
    value.length > POSTGRES_INT32_MAX_DECIMAL.length ||
    (value.length === POSTGRES_INT32_MAX_DECIMAL.length && value > POSTGRES_INT32_MAX_DECIMAL)
  ) {
    return POSTGRES_INT32_MAX;
  }
  return Number(value);
}

/** Add provider token counts without overflowing PostgreSQL `integer`. */
export function saturatingUsageTokenSum(...values: unknown[]): number {
  let total = 0;
  for (const value of values) {
    const count = normalizeUsageTokenCount(value);
    if (count >= POSTGRES_INT32_MAX - total) return POSTGRES_INT32_MAX;
    total += count;
  }
  return total;
}

/** Normalize OpenAI/xAI Responses usage into mutually exclusive token buckets. */
export function normalizeResponsesUsage(usage: Record<string, unknown>): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
} {
  const inputDetails =
    usage.input_tokens_details &&
    typeof usage.input_tokens_details === "object" &&
    !Array.isArray(usage.input_tokens_details)
      ? (usage.input_tokens_details as Record<string, unknown>)
      : {};
  const reportedInputTokens = normalizeUsageTokenCount(usage.input_tokens);
  const cacheReadTokens = Math.min(
    reportedInputTokens,
    normalizeUsageTokenCount(inputDetails.cached_tokens),
  );
  const cacheWriteTokens = Math.min(
    reportedInputTokens - cacheReadTokens,
    normalizeUsageTokenCount(inputDetails.cache_write_tokens),
  );
  return {
    inputTokens: reportedInputTokens - cacheReadTokens - cacheWriteTokens,
    outputTokens: normalizeUsageTokenCount(usage.output_tokens),
    cacheReadTokens,
    cacheWriteTokens,
  };
}
