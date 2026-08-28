import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveRuntimeCallCost, withAuditCapture } from "../src/lib/ai-audit";
import { runStructured } from "../src/lib/ai-structured";

const tool = {
  name: "extract_fixture",
  input_schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
};

function response(
  value: string,
  model?: string,
  finalProvider?: string,
  gatewayCost?: unknown,
): Response {
  return new Response(
    JSON.stringify({
      output_text: JSON.stringify({ value }),
      usage: { input_tokens: 10, output_tokens: 2 },
      ...(model ? { model } : {}),
      ...(finalProvider
        ? {
            provider_metadata: {
              gateway: {
                routing: {
                  finalProvider,
                  ...(model
                    ? {
                        modelAttempts: [
                          {
                            canonicalSlug: model,
                            success: true,
                            providerAttempts: [{ provider: finalProvider, success: true }],
                          },
                        ],
                      }
                    : {}),
                },
                ...(gatewayCost !== undefined ? { cost: gatewayCost } : {}),
              },
            },
          }
        : {}),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

function runFixture(): Promise<{ value: string }> {
  return runStructured({
    system: "Return the fixture.",
    user: "fixture",
    tool,
    complexity: "simple",
    maxTokens: 50,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AI Gateway structured runtime", () => {
  it("keeps direct OpenAI as the managed primary when Gateway is also configured", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "xai-test-key");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "openai");
    const fetchMock = vi.fn(async () => response("openai"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runFixture()).resolves.toEqual({ value: "openai" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers).toMatchObject({ Authorization: "Bearer openai-test-key" });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      text: { format: { type: "json_schema", name: "extract_fixture" } },
    });
  });

  it("keeps the governed Gateway continuity route on the OpenAI-first model policy", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "xai-test-key");
    const fetchMock = vi.fn(async () => response("gateway"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runFixture()).resolves.toEqual({ value: "gateway" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe("openai/gpt-5.6-terra");
  });

  it.each([
    ["google/gemini-3.6-flash", "vertex"],
    ["openai/gpt-5.6-terra", "openai"],
    ["xai/grok-4.6", "xai"],
  ] as const)(
    "attributes Gateway response model %s to routing finalProvider %s",
    async (servedModel, servedProvider) => {
      vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
      vi.stubEnv("VERCEL_OIDC_TOKEN", "");
      vi.stubEnv("XAI_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("GEMINI_API_KEY", "");
      vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "gateway");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response("gateway-fallback", servedModel, servedProvider, 0.0042)),
      );

      const captured = await withAuditCapture(() => runFixture());

      expect(captured.result).toEqual({ value: "gateway-fallback" });
      expect(captured.records).toEqual([
        expect.objectContaining({
          model: servedModel,
          provider: servedProvider,
          actual_cost_usd: 0.0042,
          input_tokens: 10,
          output_tokens: 2,
        }),
      ]);
    },
  );

  it("records Gateway as unknown when routing metadata is absent", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "gateway");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("gateway-fallback", "google/gemini-3.6-flash")),
    );

    const captured = await withAuditCapture(() => runFixture());

    expect(captured.records).toEqual([
      expect.objectContaining({
        model: "google/gemini-3.6-flash",
        provider: "gateway",
      }),
    ]);
  });

  it("keeps authoritative Gateway cost when routing metadata is absent", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "gateway");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({ value: "gateway-cost-only" }),
              model: "openai/gpt-5.6-terra",
              usage: { input_tokens: 10, output_tokens: 2 },
              provider_metadata: { gateway: { cost: "0.0019" } },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const captured = await withAuditCapture(() => runFixture());
    expect(captured.records[0]).toMatchObject({
      model: "openai/gpt-5.6-terra",
      provider: "gateway",
      actual_cost_usd: 0.0019,
    });
    expect(resolveRuntimeCallCost(captured.records[0])).toMatchObject({
      costBasis: "provider_reported",
      costUsd: 0.0019,
    });
  });

  it("uses the successful fallback canonicalSlug instead of a stale top-level model", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "gateway");
    const payload = {
      output_text: JSON.stringify({ value: "gateway-fallback" }),
      model: "openai/gpt-5.6-terra",
      usage: { input_tokens: 10, output_tokens: 2 },
      provider_metadata: {
        gateway: {
          cost: "0.0019",
          routing: {
            finalProvider: "vertex",
            modelAttempts: [
              {
                canonicalSlug: "openai/gpt-5.6-terra",
                success: false,
                providerAttempts: [{ provider: "openai", success: false }],
              },
              {
                canonicalSlug: "google/gemini-3.6-flash",
                success: true,
                providerAttempts: [{ provider: "vertex", success: true }],
              },
            ],
          },
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(payload), {
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const captured = await withAuditCapture(() => runFixture());

    expect(captured.records).toEqual([
      expect.objectContaining({
        model: "google/gemini-3.6-flash",
        provider: "vertex",
        actual_cost_usd: 0.0019,
      }),
    ]);
  });

  it.each([
    ["hex string", "0x10"],
    ["oversized exponent string", "1e308"],
    ["oversized exponent number", 1e308],
    ["negative", -0.01],
    ["NaN-ish", "NaN"],
  ] as const)(
    "falls back to catalog accounting for an invalid Gateway cost (%s)",
    async (_label, cost) => {
      vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
      vi.stubEnv("VERCEL_OIDC_TOKEN", "");
      vi.stubEnv("XAI_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("GEMINI_API_KEY", "");
      vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "gateway");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response("gateway-cost", "google/gemini-3.6-flash", "vertex", cost)),
      );

      const captured = await withAuditCapture(() => runFixture());
      const record = captured.records[0];

      expect(captured.result).toEqual({ value: "gateway-cost" });
      expect(record).toMatchObject({ model: "google/gemini-3.6-flash", provider: "vertex" });
      expect(record).not.toHaveProperty("actual_cost_usd");
      expect(resolveRuntimeCallCost(record)).toMatchObject({ costBasis: "catalog_estimate" });
    },
  );

  it.each([
    [
      "contradictory provider",
      {
        finalProvider: "vertex",
        modelAttempts: [
          {
            canonicalSlug: "google/gemini-3.6-flash",
            success: true,
            providerAttempts: [{ provider: "google", success: true }],
          },
        ],
      },
    ],
    [
      "multiple successful models",
      {
        finalProvider: "vertex",
        modelAttempts: [
          {
            canonicalSlug: "openai/gpt-5.6-terra",
            success: true,
            providerAttempts: [{ provider: "openai", success: true }],
          },
          {
            canonicalSlug: "google/gemini-3.6-flash",
            success: true,
            providerAttempts: [{ provider: "vertex", success: true }],
          },
        ],
      },
    ],
    [
      "multiple successful providers",
      {
        finalProvider: "vertex",
        modelAttempts: [
          {
            canonicalSlug: "google/gemini-3.6-flash",
            success: true,
            providerAttempts: [
              { provider: "google", success: true },
              { provider: "vertex", success: true },
            ],
          },
        ],
      },
    ],
    [
      "missing model success",
      {
        finalProvider: "vertex",
        modelAttempts: [
          {
            canonicalSlug: "google/gemini-3.6-flash",
            providerAttempts: [{ provider: "vertex", success: true }],
          },
        ],
      },
    ],
    [
      "missing provider success",
      {
        finalProvider: "vertex",
        modelAttempts: [
          {
            canonicalSlug: "google/gemini-3.6-flash",
            success: true,
            providerAttempts: [{ provider: "vertex" }],
          },
        ],
      },
    ],
  ] as const)("rejects ambiguous Gateway routing metadata (%s)", async (_label, routing) => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "gateway");
    const payload = {
      output_text: JSON.stringify({ value: "gateway-ambiguous" }),
      model: "openai/gpt-5.6-terra",
      usage: { input_tokens: 10, output_tokens: 2 },
      provider_metadata: { gateway: { cost: "0.0019", routing } },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(payload), {
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const captured = await withAuditCapture(() => runFixture());
    const record = captured.records[0];

    expect(captured.result).toEqual({ value: "gateway-ambiguous" });
    expect(record).toMatchObject({
      model: "openai/gpt-5.6-terra",
      provider: "gateway",
      actual_cost_usd: 0.0019,
    });
    expect(resolveRuntimeCallCost(record)).toMatchObject({
      costBasis: "provider_reported",
      costUsd: 0.0019,
    });
  });

  it("uses direct OpenAI only when Gateway authentication is unavailable", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "gateway");
    const fetchMock = vi.fn(async () => response("openai"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runFixture()).resolves.toEqual({ value: "openai" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers).toMatchObject({ Authorization: "Bearer openai-test-key" });
  });
});
