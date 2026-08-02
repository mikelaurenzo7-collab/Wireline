/** Normalize OpenAI/xAI Responses usage into mutually exclusive token buckets. */
export function normalizeResponsesUsage(usage: Record<string, unknown>): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
} {
  const inputDetails = (usage.input_tokens_details || {}) as Record<
    string,
    unknown
  >;
  const reportedInputTokens = Math.max(0, Number(usage.input_tokens || 0));
  const cacheReadTokens = Math.min(
    reportedInputTokens,
    Math.max(0, Number(inputDetails.cached_tokens || 0)),
  );
  const cacheWriteTokens = Math.min(
    reportedInputTokens - cacheReadTokens,
    Math.max(0, Number(inputDetails.cache_write_tokens || 0)),
  );
  return {
    inputTokens: reportedInputTokens - cacheReadTokens - cacheWriteTokens,
    outputTokens: Math.max(0, Number(usage.output_tokens || 0)),
    cacheReadTokens,
    cacheWriteTokens,
  };
}
