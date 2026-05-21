/** Speakable fallback when Vapi invokes a tool we did not handle. */
export const VAPI_TOOL_UNAVAILABLE_RESULT =
  "That action isn't available on this line right now. Help the caller another way.";

export type VapiToolResult = { toolCallId: string; result: string };

/** Wall-clock cap for a single live-call tool (keeps Vapi from waiting on slow IO). */
export const VAPI_TOOL_TIMEOUT_MS = 8_000;

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
  return toolCalls.map(
    (tc) =>
      lastById.get(tc.id) ?? {
        toolCallId: tc.id,
        result: VAPI_TOOL_UNAVAILABLE_RESULT,
      },
  );
}
