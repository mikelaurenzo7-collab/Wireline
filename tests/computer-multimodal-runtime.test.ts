import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../src/lib/server-logger", () => ({
  log: { warn: h.warn, info: h.info, error: h.error },
}));
beforeEach(() => {
  vi.resetModules();
  h.warn.mockClear();
  h.info.mockClear();
  h.error.mockClear();
  vi.stubEnv("XAI_API_KEY", "fixture-key");
  vi.stubEnv("OPENAI_API_KEY", "fixture-key");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const image = {
  type: "image" as const,
  mimeType: "image/png" as const,
  data: "aGVsbG8=",
  detail: "high" as const,
};
const okResponse = (model: string) =>
  new Response(
    JSON.stringify({
      model,
      output_text: '{"ok":true}',
      usage: { input_tokens: 1000, output_tokens: 20 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
const requestAt = (fetch: ReturnType<typeof vi.fn>, index: number) =>
  fetch.mock.calls[index] as unknown as [string, RequestInit];

describe("computer screenshot transport", () => {
  it("sends inline image content to the primary lane without textifying it", async () => {
    const fetch = vi.fn(async () => okResponse("grok-4.7"));
    vi.stubGlobal("fetch", fetch);
    const { runStructured } = await import("../src/lib/ai-structured");
    await runStructured({
      system: "Propose",
      user: "Observe",
      images: [image],
      maxTokens: 1800,
      tool: { name: "step", input_schema: { type: "object" } },
    });
    const [url, init] = requestAt(fetch, 0);
    expect(url).toBe("https://api.x.ai/v1/responses");
    const body = JSON.parse(init.body as string);
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "Observe" },
      { type: "input_image", detail: "high", image_url: "data:image/png;base64,aGVsbG8=" },
    ]);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(1800);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the image, schema, output bound and usage through the backup lane", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("rejected", { status: 503 }))
      .mockResolvedValueOnce(okResponse("gpt-5.6-terra"));
    vi.stubGlobal("fetch", fetch);
    const { runStructured } = await import("../src/lib/ai-structured");
    const { createAuditContext, runInAuditContext } = await import("../src/lib/ai-audit");
    const context = createAuditContext();
    await expect(
      runInAuditContext(context, () =>
        runStructured({
          system: "Propose",
          user: "Observe",
          images: [image],
          maxTokens: 1800,
          tool: { name: "step", input_schema: { type: "object" } },
        }),
      ),
    ).resolves.toEqual({ ok: true });
    const [url, init] = requestAt(fetch, 1);
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body as string);
    expect(body.input[0].content[1]).toEqual({
      type: "input_image",
      detail: "high",
      image_url: "data:image/png;base64,aGVsbG8=",
    });
    expect(body.text.format.schema).toEqual({ type: "object" });
    expect(body.max_output_tokens).toBe(1800);
    // The failed primary attempt may still be billable; the backup is recorded.
    expect(context.ambiguousProviderAttempts).toBe(1);
    expect(context.records).toHaveLength(1);
    expect(context.records[0].input_tokens).toBe(1000);
  });

  it("retains ordinary text-only Responses content", async () => {
    const { responsesInputContent } = await import("../src/lib/ai-client");
    expect(responsesInputContent("Plain text")).toBe("Plain text");
  });

  it("does not log private response excerpts or echoed screenshot data on either failed lane", async () => {
    const privateText = "PRIVATE_RECIPIENT_AND_TOOL_ARGUMENT";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${privateText} ${image.data}`, { status: 200 })),
    );
    const { runStructured } = await import("../src/lib/ai-structured");
    await expect(
      runStructured({
        system: "Propose",
        user: privateText,
        images: [image],
        tool: { name: "step", input_schema: { type: "object" } },
      }),
    ).rejects.toThrow();
    expect(h.warn).toHaveBeenCalled();
    const logs = JSON.stringify([h.warn.mock.calls, h.info.mock.calls, h.error.mock.calls]);
    expect(logs).not.toContain(privateText);
    expect(logs).not.toContain(image.data);
    expect(logs).toContain("SyntaxError");
  });
});
