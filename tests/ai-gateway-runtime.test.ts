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
