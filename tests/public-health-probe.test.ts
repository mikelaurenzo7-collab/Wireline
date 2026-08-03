import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPublicHealthPayload,
  probeOpenAIModel,
} from "../src/lib/public-health-probe";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public health probe", () => {
  it("derives the overall level from the worst component", () => {
    const payload = buildPublicHealthPayload({
      voice: { ok: true, latency_ms: 10, model: "voice" },
      reasoning: {
        ok: false,
        latency_ms: 20,
        model: "reasoning",
        error: "OpenAI probe failed (503)",
      },
      voiceFallbackConfigured: true,
      checkedAt: new Date("2026-08-03T23:00:00.000Z"),
    });

    expect(payload).toEqual({
      overall: "degraded",
      components: {
        voice_runtime: "operational",
        voice_fallback: "operational",
        reasoning: "degraded",
      },
      last_checked: "2026-08-03T23:00:00.000Z",
    });
  });

  it("treats an authorization rejection as an outage rather than transient degradation", () => {
    const payload = buildPublicHealthPayload({
      voice: {
        ok: false,
        latency_ms: 5,
        model: "voice",
        error: "OpenAI probe failed (401)",
      },
      reasoning: { ok: true, latency_ms: 5, model: "reasoning" },
      voiceFallbackConfigured: false,
    });

    expect(payload.overall).toBe("outage");
    expect(payload.components.voice_runtime).toBe("outage");
    expect(payload.components.voice_fallback).toBe("degraded");
  });

  it("does not call the metered provider without a configured key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeOpenAIModel("gpt-test", undefined)).resolves.toMatchObject({
      ok: false,
      latency_ms: 0,
      model: "gpt-test",
      error: "OPENAI_API_KEY not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels the unused response body after a successful headers-only probe", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { cancel },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeOpenAIModel("gpt-test", "test-key")).resolves.toMatchObject({
      ok: true,
      model: "gpt-test",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
