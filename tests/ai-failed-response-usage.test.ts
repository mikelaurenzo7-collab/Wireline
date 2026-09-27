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
async function load(signal?: AbortSignal) {
  const audit = await import("../src/lib/ai-audit");
  const { runStructured } = await import("../src/lib/ai-structured");
  const context = audit.createAuditContext();
  const run = () =>
    audit.runInAuditContext(context, () =>
      runStructured({
        system: "Return the fixture.",
        user: "fixture",
        maxTokens: 50,
        signal,
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

  it("retains the unknown fallback after a known billed response and caller cancellation", async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ ...success, output_text: "" }))
      .mockImplementationOnce(
        async (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(init.signal!.reason), {
              once: true,
            });
            controller.abort(new DOMException("Canceled", "AbortError"));
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { context, run } = await load(controller.signal);
    await expect(run()).rejects.toThrow("Canceled");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(context.records).toHaveLength(1);
    expect(context.records[0]).toMatchObject({ input_tokens: 60, output_tokens: 20 });
    expect(context.ambiguousProviderAttempts).toBe(1);
  });

  it("does not classify an already-canceled request as a submitted provider attempt", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Canceled", "AbortError"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { context, run } = await load(controller.signal);
    await expect(run()).rejects.toThrow("Canceled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(context.ambiguousProviderAttempts).toBe(0);
  });

  it.each([
    undefined,
    {},
    { input_tokens: "100", output_tokens: 20 },
    { input_tokens: 100, output_tokens: -1 },
    { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 101 } },
    { input_tokens: 100, output_tokens: 20, input_tokens_details: { cache_write_tokens: -1 } },
  ])(
    "preserves useful output but keeps missing/malformed usage ambiguous: %j",
    async (reportedUsage) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(response({ ...success, usage: reportedUsage })),
      );
      const { context, run } = await load();
      await expect(run()).resolves.toEqual({ value: "ok" });
      expect(context.records).toHaveLength(1);
      expect(context.ambiguousProviderAttempts).toBe(1);
    },
  );

  it("accepts explicit valid zero usage as known", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          ...success,
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      ),
    );
    const { context, run } = await load();
    await run();
    expect(context.records[0]).toMatchObject({ input_tokens: 0, output_tokens: 0 });
    expect(context.ambiguousProviderAttempts).toBe(0);
  });

  it.each([0, 0.0042])(
    "uses authoritative Gateway cost %s when token usage is absent",
    async (cost) => {
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          response({
            output_text: success.output_text,
            provider_metadata: { gateway: { cost } },
          }),
        ),
      );
      const { context, run } = await load();
      await expect(run()).resolves.toEqual({ value: "ok" });
      expect(context.records[0]).toMatchObject({ actual_cost_usd: cost });
      expect(context.ambiguousProviderAttempts).toBe(0);
    },
  );
});
