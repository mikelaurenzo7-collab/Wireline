import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPublicHealthPayload,
  probeOpenAIModel,
  probeOpenAIRealtimeModel,
} from "../src/lib/public-health-probe";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public health probe", () => {
  it("derives degradation from a transient primary reasoning failure", () => {
    const payload = buildPublicHealthPayload({
      voice: { ok: true, latency_ms: 10, model: "voice" },
      reasoning: {
        ok: false,
        latency_ms: 20,
        model: "reasoning",
        error: "OpenAI Responses probe failed (503)",
      },
      checkedAt: new Date("2026-08-03T23:00:00.000Z"),
    });

    expect(payload).toEqual({
      overall: "degraded",
      components: {
        voice_runtime: "operational",
        reasoning: "degraded",
      },
      last_checked: "2026-08-03T23:00:00.000Z",
    });
  });

  it("requires a fresh healthy PSTN canary before production voice is operational", () => {
    const checkedAt = new Date("2026-08-31T00:00:00.000Z");
    const base = {
      voice: { ok: true, latency_ms: 10, model: "voice" },
      reasoning: { ok: true, latency_ms: 10, model: "reasoning" },
      requireVoiceCanary: true,
      checkedAt,
    };

    const unhealthy = buildPublicHealthPayload({
      ...base,
      voiceCanary: { healthy: false, checked_at: checkedAt.toISOString() },
    });
    expect(unhealthy.overall).toBe("degraded");
    expect(unhealthy.components.voice_runtime).toBe("degraded");

    const stale = buildPublicHealthPayload({
      ...base,
      voiceCanary: { healthy: true, checked_at: "2026-08-29T00:00:00.000Z" },
    });
    expect(stale.components.voice_runtime).toBe("degraded");

    const healthy = buildPublicHealthPayload({
      ...base,
      voiceCanary: { healthy: true, checked_at: checkedAt.toISOString() },
    });
    expect(healthy.overall).toBe("operational");
    expect(healthy.components.voice_runtime).toBe("operational");
  });

  it("treats an authorization rejection in a primary path as an outage", () => {
    const payload = buildPublicHealthPayload({
      voice: {
        ok: false,
        latency_ms: 5,
        model: "voice",
        error: "OpenAI Realtime model probe failed (401)",
      },
      reasoning: { ok: true, latency_ms: 5, model: "reasoning" },
    });

    expect(payload.overall).toBe("outage");
    expect(payload.components.voice_runtime).toBe("outage");
  });

  it("does not call OpenAI surfaces without its configured key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeOpenAIModel("gpt-test", undefined)).resolves.toMatchObject({
      ok: false,
      latency_ms: 0,
      model: "gpt-test",
      error: "OPENAI_API_KEY not configured",
    });
    await expect(probeOpenAIRealtimeModel("gpt-realtime-test", undefined)).resolves.toMatchObject({
      ok: false,
      latency_ms: 0,
      model: "gpt-realtime-test",
      error: "OPENAI_API_KEY not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the OpenAI Realtime control plane without creating calls or output", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { cancel },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      probeOpenAIRealtimeModel("gpt-realtime-test", "test-openai-key"),
    ).resolves.toMatchObject({
      ok: true,
      model: "gpt-realtime-test",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models/gpt-realtime-test",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer test-openai-key",
          Accept: "application/json",
        },
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(request).not.toHaveProperty("body");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("probes the real OpenAI Responses execution path without model-specific controls", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { cancel },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeOpenAIModel("gpt-test/model", "test-key")).resolves.toMatchObject({
      ok: true,
      model: "gpt-test/model",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).toEqual({
      model: "gpt-test/model",
      input: "Reply with OK.",
      max_output_tokens: 16,
      store: false,
    });
    expect(payload).not.toHaveProperty("reasoning");
    expect(payload).not.toHaveProperty("text");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not fail a healthy probe if response-body cancellation is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { cancel: vi.fn().mockRejectedValue(new Error("already closed")) },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeOpenAIModel("gpt-test", "test-key")).resolves.toMatchObject({
      ok: true,
      model: "gpt-test",
    });
  });
});
