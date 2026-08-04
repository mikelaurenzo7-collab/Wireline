import { getErrorMessage } from "./server-utils";

export interface HealthModelProbeResult {
  ok: boolean;
  latency_ms: number;
  model: string;
  error?: string;
}

/**
 * Run the authenticated, token-generating model diagnostic with a hard network
 * deadline. The injected fetch implementation keeps cancellation behavior
 * directly testable without issuing provider traffic.
 */
export async function probeOpenAIModelDiagnostic(
  model: string,
  timeoutMs = 8000,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthModelProbeResult> {
  const started = Date.now();
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, latency_ms: 0, model, error: "OPENAI_API_KEY not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("model probe timed out")),
    timeoutMs,
  );

  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Responses API requires max_output_tokens >= 16; a smaller probe value
      // returns HTTP 400 and falsely marks production as an outage.
      body: JSON.stringify({ model, input: "ping", max_output_tokens: 16 }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI probe failed (${response.status})`);
    return { ok: true, latency_ms: Date.now() - started, model };
  } catch (error) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      model,
      error: (controller.signal.aborted ? "model probe timed out" : getErrorMessage(error)).slice(
        0,
        240,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}
