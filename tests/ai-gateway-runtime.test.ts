import { afterEach, describe, expect, it, vi } from "vitest";

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

function response(value: string): Response {
  return new Response(
    JSON.stringify({
      output_text: JSON.stringify({ value }),
      usage: { input_tokens: 10, output_tokens: 2 },
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
  it("routes structured work through Gateway with the approved model fallback chain", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "xai-test-key");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "openai"); // Gateway remains authoritative.
    const fetchMock = vi.fn(async () => response("gateway"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runFixture()).resolves.toEqual({ value: "gateway" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/responses");
    expect(init.headers).toMatchObject({ Authorization: "Bearer gateway-test-key" });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "xai/grok-4.6",
      providerOptions: {
        gateway: {
          models: [
            "xai/grok-4.6",
            "openai/gpt-5.6-terra",
            "google/gemini-3.6-flash",
          ],
        },
      },
      text: { format: { type: "json_schema", name: "extract_fixture" } },
    });
  });

  it("does not promote OpenAI for simple structured work", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("XAI_API_KEY", "xai-test-key");
    const fetchMock = vi.fn(async () => response("gateway"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runFixture()).resolves.toEqual({ value: "gateway" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe("xai/grok-4.6");
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
