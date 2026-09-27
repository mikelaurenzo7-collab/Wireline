import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: h.generateContent };
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("OPENAI_API_KEY", "openai-test");
  vi.stubEnv("GEMINI_API_KEY", "gemini-test");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "openai");
  vi.stubEnv("WIRELINE_GEMINI_STRUCTURED_FALLBACK_MODEL", "gemini-3.6-flash");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("unavailable", { status: 503 })),
  );
  h.generateContent.mockReset().mockResolvedValue({
    response: {
      text: () => '{"value":"fallback"}',
      usageMetadata: {
        promptTokenCount: 100,
        cachedContentTokenCount: 20,
        candidatesTokenCount: 30,
        thoughtsTokenCount: 40,
      },
    },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Gemini fallback output budget", () => {
  it.each([
    [undefined, 1],
    [{}, 1],
    [{ promptTokenCount: -1, candidatesTokenCount: 2 }, 1],
    [{ promptTokenCount: 2, candidatesTokenCount: 2, thoughtsTokenCount: NaN }, 1],
    [{ promptTokenCount: 2, candidatesTokenCount: 2, cachedContentTokenCount: 3 }, 1],
    [{ promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0 }, 0],
  ])(
    "keeps successful output with incomplete Gemini usage conservative: %j",
    async (usageMetadata, ambiguousAttempts) => {
      vi.stubEnv("OPENAI_API_KEY", "");
      h.generateContent.mockResolvedValue({
        response: { text: () => '{"value":"fallback"}', usageMetadata },
      });
      const { createAuditContext, runInAuditContext } = await import("../src/lib/ai-audit");
      const { runStructured } = await import("../src/lib/ai-structured");
      const context = createAuditContext();
      await expect(
        runInAuditContext(context, () =>
          runStructured({
            system: "Extract facts.",
            user: "Fixture.",
            maxTokens: 1200,
            tool: { name: "fixture", input_schema: { type: "object" } },
          }),
        ),
      ).resolves.toEqual({ value: "fallback" });
      expect(context.records).toHaveLength(1);
      expect(context.ambiguousProviderAttempts).toBe(ambiguousAttempts);
    },
  );

  it.each([1200, 1800])(
    "keeps the %i-token request ceiling and accounts for thinking",
    async (maxTokens) => {
      const { createAuditContext, runInAuditContext } = await import("../src/lib/ai-audit");
      const { runStructured } = await import("../src/lib/ai-structured");
      const context = createAuditContext();
      await expect(
        runInAuditContext(context, () =>
          runStructured({
            system: "Extract the supplied facts.",
            user: "Fixture.",
            maxTokens,
            tool: {
              name: "fixture",
              input_schema: { type: "object", properties: { value: { type: "string" } } },
            },
          }),
        ),
      ).resolves.toEqual({ value: "fallback" });
      expect(h.generateContent).toHaveBeenCalledOnce();
      expect(h.generateContent.mock.calls[0][0].generationConfig).toEqual({
        responseMimeType: "application/json",
        maxOutputTokens: maxTokens,
      });
      expect(context.records).toEqual([
        expect.objectContaining({
          provider: "google",
          input_tokens: 80,
          output_tokens: 70,
          cache_read_tokens: 20,
        }),
      ]);
      expect(context.ambiguousProviderAttempts).toBe(1);
    },
  );

  it.each([
    [undefined, 4096],
    [NaN, 4096],
    [Infinity, 4096],
    [0, 4096],
    [-1, 4096],
    [1200.8, 1200],
    [0.5, 1],
  ])("sends a positive integer for a raw request bound of %s", async (maxTokens, expected) => {
    const { getRuntimeClient } = await import("../src/lib/ai-client");
    await getRuntimeClient().messages.create({
      messages: [{ role: "user", content: "Fixture." }],
      max_tokens: maxTokens,
    });
    expect(h.generateContent.mock.calls[0][0].generationConfig.maxOutputTokens).toBe(expected);
  });
});
