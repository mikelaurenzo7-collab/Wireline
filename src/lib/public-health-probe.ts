export type PublicHealthLevel = "operational" | "degraded" | "outage";

export interface PublicModelProbe {
  ok: boolean;
  latency_ms: number;
  model: string;
  error?: string;
}

export interface PublicHealthPayload {
  overall: PublicHealthLevel;
  components: {
    voice_runtime: PublicHealthLevel;
    voice_fallback: PublicHealthLevel;
    reasoning: PublicHealthLevel;
  };
  last_checked: string;
}

export const PUBLIC_HEALTH_PROBE_TIMEOUT_MS = 8_000;

function probeLevel(probe: Pick<PublicModelProbe, "ok" | "error">): PublicHealthLevel {
  if (probe.ok) return "operational";
  if (/not configured|missing|timed out|abort|429|500|502|503|504/i.test(probe.error || "")) {
    return "degraded";
  }
  return "outage";
}

export function buildPublicHealthPayload(input: {
  voice: PublicModelProbe;
  voiceFallback: PublicModelProbe;
  reasoning: PublicModelProbe;
  checkedAt?: Date;
}): PublicHealthPayload {
  const components: PublicHealthPayload["components"] = {
    voice_runtime: probeLevel(input.voice),
    voice_fallback: probeLevel(input.voiceFallback),
    reasoning: probeLevel(input.reasoning),
  };
  const severity: Record<PublicHealthLevel, number> = {
    operational: 0,
    degraded: 1,
    outage: 2,
  };
  const overall = Object.values(components).reduce<PublicHealthLevel>(
    (worst, current) => (severity[current] > severity[worst] ? current : worst),
    "operational",
  );
  return {
    overall,
    components,
    last_checked: (input.checkedAt ?? new Date()).toISOString(),
  };
}

/**
 * Check that the configured key can resolve a specific OpenAI model without
 * generating output. The model metadata endpoint validates connectivity,
 * authentication, and model access while consuming no inference tokens.
 */
export async function probeOpenAIModel(
  model: string,
  apiKey: string | undefined,
  timeoutMs = PUBLIC_HEALTH_PROBE_TIMEOUT_MS,
): Promise<PublicModelProbe> {
  const started = Date.now();
  if (!apiKey) {
    return { ok: false, latency_ms: 0, model, error: "OPENAI_API_KEY not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("model probe timed out")), timeoutMs);
  timeout.unref?.();
  try {
    const response = await fetch(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error(`OpenAI model probe failed (${response.status})`);
    return { ok: true, latency_ms: Date.now() - started, model };
  } catch (error) {
    const message = controller.signal.aborted
      ? "model probe timed out"
      : error instanceof Error
        ? error.message
        : String(error);
    return {
      ok: false,
      latency_ms: Date.now() - started,
      model,
      error: message.slice(0, 240),
    };
  } finally {
    clearTimeout(timeout);
  }
}
