import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("WIRELINE_STRUCTURED_PRIMARY_PROVIDER", "openai");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
const usage = {
  input_tokens: 100,
  output_tokens: 20,
  input_tokens_details: { cached_tokens: 30, cache_write_tokens: 10 },
};
const success = { model: "gpt-5.6-terra", output_text: '{"value":"ok"}', usage };
async function load() {
  const audit = await import("../src/lib/ai-audit");
  const { runStructured } = await import("../src/lib/ai-structured");
  const context = audit.createAuditContext();
  const run = () =>
    audit.runInAuditContext(context, () =>
      runStructured({
        system: "Return the fixture.",
        user: "fixture",
        maxTokens: 50,
        tool: {
          name: "fixture",
          input_schema: { type: "object", properties: { value: { type: "string" } } },
        },
      }),
    );
  return { context, run };
}

describe("billable unusable Responses output", () => {
  it.each(["", "{invalid JSON"])(
    "records %j output before a successful fallback exactly once",
    async (output) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response({ ...success, output_text: output }))
        .mockResolvedValueOnce(response(success));
      vi.stubGlobal("fetch", fetchMock);
      const { context, run } = await load();
      await expect(run()).resolves.toEqual({ value: "ok" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(context.records).toHaveLength(2);
      expect(context.records[0]).toMatchObject({
        input_tokens: 60,
        output_tokens: 20,
        cache_read_tokens: 30,
        cache_create_tokens: 10,
      });
      expect(context.ambiguousProviderAttempts).toBe(0);
    },
  );
  it("retains usage when no fallback succeeds", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ ...success, output: [], output_text: "" })),
    );
    const { context, run } = await load();
    await expect(run()).rejects.toThrow("unusable response");
    expect(context.records).toHaveLength(1);
    expect(context.ambiguousProviderAttempts).toBe(0);
  });
  it("leaves missing usage ambiguous instead of claiming the failed request was free", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ output_text: "", usage: {} }))
        .mockResolvedValueOnce(response(success)),
    );
    const { context, run } = await load();
    await run();
    expect(context.records).toHaveLength(1);
    expect(context.ambiguousProviderAttempts).toBe(1);
  });
  it("does not double record ordinary valid output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(success)));
    const { context, run } = await load();
    await run();
    expect(context.records).toHaveLength(1);
  });
});
