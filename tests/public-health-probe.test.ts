import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPublicHealthPayload,
  probeOpenAIModel,
  probeVapiManagedVoice,
} from "../src/lib/public-health-probe";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public health probe", () => {
  it("derives degradation from a transient primary reasoning failure", () => {
    const payload = buildPublicHealthPayload({
      voice: { ok: true, latency_ms: 10, model: "voice" },
      voiceFallback: { ok: true, latency_ms: 12, model: "voice-fallback" },
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
        voice_fallback: "operational",
        reasoning: "degraded",
      },
      last_checked: "2026-08-03T23:00:00.000Z",
    });
  });

  it("reports lost fallback resilience as degraded, not a full platform outage", () => {
    const payload = buildPublicHealthPayload({
      voice: { ok: true, latency_ms: 5, model: "voice" },
      voiceFallback: {
        ok: false,
        latency_ms: 5,
        model: "voice-fallback",
        error: "provider rejected fallback (401)",
      },
      reasoning: { ok: true, latency_ms: 5, model: "reasoning" },
    });

    expect(payload.overall).toBe("degraded");
    expect(payload.components.voice_runtime).toBe("operational");
    expect(payload.components.voice_fallback).toBe("outage");
  });

  it("treats an authorization rejection in a primary path as an outage", () => {
    const payload = buildPublicHealthPayload({
      voice: {
        ok: false,
        latency_ms: 5,
        model: "voice",
        error: "Vapi control-plane probe failed (401)",
      },
      voiceFallback: {
        ok: false,
        latency_ms: 5,
        model: "voice-fallback",
        error: "Vapi control-plane probe failed (401)",
      },
      reasoning: { ok: true, latency_ms: 5, model: "reasoning" },
    });

    expect(payload.overall).toBe("outage");
    expect(payload.components.voice_runtime).toBe("outage");
    expect(payload.components.voice_fallback).toBe("outage");
  });

  it("does not call either provider without its configured key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeOpenAIModel("gpt-test", undefined)).resolves.toMatchObject({
      ok: false,
      latency_ms: 0,
      model: "gpt-test",
      error: "OPENAI_API_KEY not configured",
    });
    await expect(probeVapiManagedVoice(undefined)).resolves.toMatchObject({
      ok: false,
      latency_ms: 0,
      model: "vapi-managed-voice",
      error: "VAPI_PRIVATE_KEY not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the owning Vapi control plane without creating calls or output", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { cancel },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeVapiManagedVoice("test-vapi-key")).resolves.toMatchObject({
      ok: true,
      model: "vapi-managed-voice",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.vapi.ai/assistant?limit=1",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer test-vapi-key",
          Accept: "application/json",
        },
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(request).not.toHaveProperty("body");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("probes the real OpenAI Responses execution path with minimum reasoning and output", async () => {
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
    expect(JSON.parse(String(request.body))).toEqual({
      model: "gpt-test/model",
      input: "Reply with OK.",
      max_output_tokens: 16,
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
      store: false,
    });
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