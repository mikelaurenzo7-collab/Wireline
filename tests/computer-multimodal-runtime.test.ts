import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  generateContent: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../src/lib/server-logger", () => ({
  log: { warn: h.warn, info: h.info, error: h.error },
}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: h.generateContent };
    }
  },
}));
beforeEach(() => {
  vi.resetModules();
  h.warn.mockClear();
  h.info.mockClear();
  h.error.mockClear();
  vi.stubEnv("OPENAI_API_KEY", "fixture-key");
  vi.stubEnv("GEMINI_API_KEY", "fixture-key");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "openai");
  h.generateContent.mockReset().mockResolvedValue({
    response: {
      text: () => '{"ok":true}',
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 20 },
    },
  });
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

describe("computer screenshot transport", () => {
  it("sends inline image content through Responses without textifying it", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "gpt-5.6-terra",
            output_text: '{"ok":true}',
            usage: { input_tokens: 1000, output_tokens: 20 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const { runStructured } = await import("../src/lib/ai-structured");
    await runStructured({
      system: "Propose",
      user: "Observe",
      images: [image],
      maxTokens: 1800,
      tool: { name: "step", input_schema: { type: "object" } },
    });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "Observe" },
      { type: "input_image", detail: "high", image_url: "data:image/png;base64,aGVsbG8=" },
    ]);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(1800);
    expect(h.generateContent).not.toHaveBeenCalled();
  });
  it("keeps the image, schema, output bound and usage through actual Gemini fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rejected", { status: 503 })),
    );
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
    const request = h.generateContent.mock.calls[0][0];
    expect(request.contents[0].parts).toEqual([
      { text: "Observe" },
      { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } },
      { text: expect.stringContaining("Return one JSON object") },
    ]);
    expect(request.generationConfig.maxOutputTokens).toBe(1800);
    expect(context.ambiguousProviderAttempts).toBe(1);
    expect(context.records).toHaveLength(1);
    expect(context.records[0].input_tokens).toBe(1000);
  });
  it("retains ordinary text-only Responses content", async () => {
    const { responsesInputContent, geminiInputParts } = await import("../src/lib/ai-client");
    expect(responsesInputContent("Plain text")).toBe("Plain text");
    expect(geminiInputParts("Plain text")).toEqual([{ text: "Plain text" }]);
  });
  it("does not log private response excerpts or echoed screenshot data on either failed lane", async () => {
    const privateText = "PRIVATE_RECIPIENT_AND_TOOL_ARGUMENT";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${privateText} ${image.data}`, { status: 200 })),
    );
    h.generateContent.mockRejectedValue(new Error(`Provider echoed ${privateText} ${image.data}`));
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
