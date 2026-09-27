import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAuditContext,
  runInAuditContext,
  resolveRuntimeCallCost,
  withAuditCapture,
} from "../src/lib/ai-audit";
import { extractImageAsset } from "../src/routes/agent-routes-v2";

vi.mock("../src/lib/managed-ai-operation-spend", () => ({
  runWithManagedAiSpend: ({ operation }: { operation: () => Promise<unknown> }) => operation(),
}));

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

    await expect(extractImageAsset("menu.png", image, "tenant")).resolves.toEqual({
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
    await expect(extractImageAsset("menu.png", image, "tenant")).rejects.toMatchObject({
      status: 503,
    });
  });

  it("keeps a rejected provider response actionable after the spend wrapper classifies it", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(429, {})),
    );
    await expect(extractImageAsset("menu.png", image, "tenant")).rejects.toMatchObject({
      status: 502,
      message: "Image training is temporarily unavailable. Try again shortly.",
    });
  });

  it.each([undefined, 0.0019])(
    "retains ambiguity for impossible cache usage unless authoritative cost is supplied (%s)",
    async (cost) => {
      vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
      vi.stubEnv("VERCEL_OIDC_TOKEN", "");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          response(200, {
            model: "openai/gpt-5.6-terra",
            output_text: JSON.stringify({ directives: [], knowledge: [], personality: "Warm" }),
            usage: {
              input_tokens: 100,
              output_tokens: 10,
              input_tokens_details: { cached_tokens: 100_000_000 },
            },
            ...(cost === undefined ? {} : { provider_metadata: { gateway: { cost } } }),
          }),
        ),
      );
      const context = createAuditContext();
      await expect(
        runInAuditContext(context, () => extractImageAsset("menu.png", image, "tenant")),
      ).resolves.toMatchObject({ personality: "Warm" });
      expect(context.ambiguousProviderAttempts).toBe(cost === undefined ? 1 : 0);
      if (cost !== undefined) expect(resolveRuntimeCallCost(context.records[0]).costUsd).toBe(cost);
    },
  );

  it("refuses a vision override without a verified image-token bound before provider work", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("WIRELINE_GATEWAY_VISION_MODEL", "google/gemini-3.1-pro-preview");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractImageAsset("menu.png", image, "tenant")).rejects.toMatchObject({
      status: 503,
      code: "AI_SPEND_BOUND_UNAVAILABLE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

    const captured = await withAuditCapture(() => extractImageAsset("menu.png", image, "tenant"));

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
