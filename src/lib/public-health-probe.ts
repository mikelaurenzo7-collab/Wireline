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

  // Losing a redundant fallback reduces resilience but does not make the live
  // platform unavailable while both primary voice and reasoning remain usable.
  // A hard outage in either primary execution path is still a platform outage.
  const primaryOutage =
    components.voice_runtime === "outage" || components.reasoning === "outage";
  const anyDegradation = Object.values(components).some((level) => level !== "operational");
  const overall: PublicHealthLevel = primaryOutage
    ? "outage"
    : anyDegradation
      ? "degraded"
      : "operational";

  return {
    overall,
    components,
    last_checked: (input.checkedAt ?? new Date()).toISOString(),
  };
}

async function probeGetEndpoint(input: {
  url: string;
  apiKey: string | undefined;
  keyName: string;
  label: string;
  failurePrefix: string;
  timeoutMs: number;
}): Promise<PublicModelProbe> {
  const started = Date.now();
  if (!input.apiKey) {
    return {
      ok: false,
      latency_ms: 0,
      model: input.label,
      error: `${input.keyName} not configured`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("provider probe timed out")),
    input.timeoutMs,
  );
  timeout.unref?.();
  try {
    const response = await fetch(input.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error(`${input.failurePrefix} (${response.status})`);
    return { ok: true, latency_ms: Date.now() - started, model: input.label };
  } catch (error) {
    const message = controller.signal.aborted
      ? "provider probe timed out"
      : error instanceof Error
        ? error.message
        : String(error);
    return {
      ok: false,
      latency_ms: Date.now() - started,
      model: input.label,
      error: message.slice(0, 240),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check the managed Vapi control plane without creating a call, chat, or model
 * output. The exact primary/fallback assistant schema is certified separately
 * during preview builds by creating and deleting one inert assistant.
 */
export function probeVapiManagedVoice(
  apiKey: string | undefined,
  timeoutMs = PUBLIC_HEALTH_PROBE_TIMEOUT_MS,
): Promise<PublicModelProbe> {
  return probeGetEndpoint({
    url: "https://api.vapi.ai/assistant?limit=1",
    apiKey,
    keyName: "VAPI_PRIVATE_KEY",
    label: "vapi-managed-voice",
    failurePrefix: "Vapi control-plane probe failed",
    timeoutMs,
  });
}

/**
 * Check the same OpenAI Responses execution surface used by Wireline's managed
 * reasoning runtime. A model-metadata GET can be slow or unavailable while
 * inference is healthy, which makes it a poor public product-health signal.
 *
 * Keep this request intentionally model-neutral. `WIRELINE_OPENAI_STRUCTURED_MODEL`
 * is an operator override, so a probe that adds GPT-5.6-only reasoning or
 * verbosity controls can falsely report an outage for an otherwise valid
 * Responses model. The shared Redis result/lock in public-health-api bounds
 * this to one minimal inference per cache refresh globally.
 */
export async function probeOpenAIModel(
  model: string,
  apiKey: string | undefined,
  timeoutMs = PUBLIC_HEALTH_PROBE_TIMEOUT_MS,
): Promise<PublicModelProbe> {
  const started = Date.now();
  if (!apiKey) {
    return {
      ok: false,
      latency_ms: 0,
      model,
      error: "OPENAI_API_KEY not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("provider probe timed out")),
    timeoutMs,
  );
  timeout.unref?.();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: "Reply with OK.",
        max_output_tokens: 16,
        store: false,
      }),
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error(`OpenAI Responses probe failed (${response.status})`);
    return { ok: true, latency_ms: Date.now() - started, model };
  } catch (error) {
    const message = controller.signal.aborted
      ? "provider probe timed out"
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
