/** Speakable fallback when Vapi invokes a tool we did not handle. */
export const VAPI_TOOL_UNAVAILABLE_RESULT =
  "That action isn't available on this line right now. Help the caller another way.";

export type VapiToolResult = { toolCallId: string; result: string };

/** Wall-clock cap for a single live-call tool (keeps Vapi from waiting on slow IO). */
export const VAPI_TOOL_TIMEOUT_MS = 8_000;

/** Max concurrent tool handlers per Vapi tool-calls webhook (audit #4). */
export const MAX_VAPI_PARALLEL_TOOL_CALLS = 3;

/** Cap tool results returned to Vapi (audit #4 — bounded next-turn context). */
export const MAX_VAPI_TOOL_RESULT_CHARS = 1_200;

/**
 * Vapi requires tool results to be single-line strings. Remove Wireline's
 * optional machine-only data suffix, collapse whitespace, and enforce the
 * next-turn prompt budget. This keeps webhook responses parseable while
 * retaining the semantic ordering of knowledge, CRM, order, and availability
 * results.
 */
export function truncateVapiToolResult(result: string, max = MAX_VAPI_TOOL_RESULT_CHARS): string {
  const text = String(result || "")
    .replace(/\s*\[data:\s*[\s\S]*?\]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** Run tool handlers with a fixed concurrency pool instead of unbounded Promise.all. */
export async function runVapiToolCallsWithConcurrency<T, I>(
  items: I[],
  fn: (item: I, index: number) => Promise<T>,
  concurrency = MAX_VAPI_PARALLEL_TOOL_CALLS,
): Promise<T[]> {
  if (items.length === 0) return [];
  const out: T[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  const pool = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return out;
}

export function withVapiToolTimeout<T>(
  work: Promise<T>,
  timeoutMs: number = VAPI_TOOL_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("VAPI_TOOL_TIMEOUT"));
    }, timeoutMs);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Ensure every toolCallId in the batch has exactly one result (for parallel dispatch). */
export function finalizeVapiToolBatch(
  toolCalls: Array<{ id: string }>,
  batch: VapiToolResult[],
): VapiToolResult[] {
  const lastById = new Map<string, VapiToolResult>();
  for (const r of batch) {
    lastById.set(r.toolCallId, r);
  }
  return toolCalls.map((tc) => {
    const row = lastById.get(tc.id) ?? {
      toolCallId: tc.id,
      result: VAPI_TOOL_UNAVAILABLE_RESULT,
    };
    return { ...row, result: truncateVapiToolResult(row.result) };
  });
}
