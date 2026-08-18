import { afterEach, describe, expect, it, vi } from "vitest";

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
        model: "xai/grok-4.5",
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
      model: "xai/grok-4.5",
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
});
