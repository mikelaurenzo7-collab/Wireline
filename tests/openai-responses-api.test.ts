import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordAmbiguousProviderAttempt: vi.fn(),
}));

vi.mock("../src/lib/ai-audit", () => ({
  recordAmbiguousProviderAttempt: mocks.recordAmbiguousProviderAttempt,
}));
vi.mock("../src/lib/ai-client", () => ({
  DefiniteProviderRejectionError: class DefiniteProviderRejectionError extends Error {},
  RuntimeUnavailableError: class RuntimeUnavailableError extends Error {},
}));

import {
  openAIResponsesCreate,
  openAIResponsesInputTokensCount,
} from "../src/lib/openai-responses-api";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenAI Responses API transport", () => {
  it("counts input tokens using the authenticated Responses endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ input_tokens: 42 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      openAIResponsesInputTokensCount({ model: "gpt-5.6-luna", input: [] }),
    ).resolves.toBe(42);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses/input_tokens",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-5.6-luna", input: [] }),
      }),
    );
    expect(mocks.recordAmbiguousProviderAttempt).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "42", -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid token count (%s)",
    async (input_tokens) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ input_tokens }) }),
      );

      await expect(openAIResponsesInputTokensCount({ model: "gpt-5.6-luna" })).rejects.toThrow();
      expect(mocks.recordAmbiguousProviderAttempt).not.toHaveBeenCalled();
    },
  );

  it("does not classify a failed token-count request as an ambiguous generation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    await expect(openAIResponsesInputTokensCount({ model: "gpt-5.6-luna" })).rejects.toThrow();
    expect(mocks.recordAmbiguousProviderAttempt).not.toHaveBeenCalled();
  });

  it("still records an ambiguous generation when the Responses request fails after submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    await expect(openAIResponsesCreate({ model: "gpt-5.6-luna" })).rejects.toThrow();
    expect(mocks.recordAmbiguousProviderAttempt).toHaveBeenCalledOnce();
  });
});
