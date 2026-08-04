import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildPublicHealthPayload,
  probeOpenAIModel,
} from "../src/lib/public-health-probe";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public health probe", () => {
  it("derives the overall level from the worst actual model component", () => {
    const payload = buildPublicHealthPayload({
      voice: { ok: true, latency_ms: 10, model: "voice" },
      voiceFallback: { ok: true, latency_ms: 12, model: "voice-fallback" },
      reasoning: {
        ok: false,
        latency_ms: 20,
        model: "reasoning",
        error: "OpenAI model probe failed (503)",
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

  it("treats an authorization rejection as an outage rather than transient degradation", () => {
    const payload = buildPublicHealthPayload({
      voice: {
        ok: false,
        latency_ms: 5,
        model: "voice",
        error: "OpenAI model probe failed (401)",
      },
      voiceFallback: {
        ok: false,
        latency_ms: 5,
        model: "voice-fallback",
        error: "OpenAI model probe failed (401)",
      },
      reasoning: { ok: true, latency_ms: 5, model: "reasoning" },
    });

    expect(payload.overall).toBe("outage");
    expect(payload.components.voice_runtime).toBe("outage");
    expect(payload.components.voice_fallback).toBe("outage");
  });

  it("does not call the provider without a configured key", async () => {
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

  it("uses model metadata rather than a token-generating Responses request", async () => {
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
      "https://api.openai.com/v1/models/gpt-test%2Fmodel",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer test-key" },
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(request).not.toHaveProperty("body");
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
