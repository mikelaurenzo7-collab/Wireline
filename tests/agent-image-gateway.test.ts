import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveRuntimeCallCost, withAuditCapture } from "../src/lib/ai-audit";
import { extractImageAsset } from "../src/routes/agent-routes-v2";

const image = "data:image/png;base64,aGVsbG8=";

function response(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("agent image training through AI Gateway", () => {
  it("sends the image and schema to Gateway without using a provider credential", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn(async () =>
      response(200, {
        model: "openai/gpt-5.6-terra",
        output_text: JSON.stringify({ directives: [], knowledge: [], personality: "Warm" }),
        usage: { input_tokens: 10, output_tokens: 2 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractImageAsset("menu.png", image)).resolves.toEqual({
      directives: [],
      knowledge: [],
      personality: "Warm",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/responses");
    expect(init.headers).toMatchObject({ Authorization: "Bearer gateway-test-key" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "openai/gpt-5.6-terra",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract agent-training information from the image asset named menu.png.",
            },
            { type: "input_image", image_url: image, detail: "low" },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "studio_asset_extraction" } },
    });
  });

  it("fails closed when Gateway authentication is unavailable", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    await expect(extractImageAsset("menu.png", image)).rejects.toMatchObject({ status: 503 });
  });

  it("honors an explicit governed Gateway vision-model override", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("WIRELINE_GATEWAY_VISION_MODEL", "google/gemini-3.1-pro-preview");
    const fetchMock = vi.fn(async () =>
      response(200, {
        model: "google/gemini-3.1-pro-preview",
        output_text: JSON.stringify({ directives: [], knowledge: [], personality: "" }),
        usage: { input_tokens: 8, output_tokens: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await extractImageAsset("menu.png", image);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "google/gemini-3.1-pro-preview",
    });
  });

  it("propagates authoritative Gateway routing and cost evidence into vision audit records", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    const fetchMock = vi.fn(async () =>
      response(200, {
        model: "openai/gpt-5.6-terra",
        output_text: JSON.stringify({ directives: [], knowledge: [], personality: "Warm" }),
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
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const captured = await withAuditCapture(() => extractImageAsset("menu.png", image));

    expect(captured.records).toEqual([
      expect.objectContaining({
        model: "google/gemini-3.6-flash",
        provider: "vertex",
        actual_cost_usd: 0.0019,
        input_tokens: 10,
        output_tokens: 2,
      }),
    ]);
    expect(resolveRuntimeCallCost(captured.records[0])).toEqual({
      costUsd: 0.0019,
      costBasis: "provider_reported",
    });
  });
});
