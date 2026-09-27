import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  boundedTrainingReserveUsd,
  runTrainingImage,
  runTrainingStructured,
  trainingAttemptModels,
} from "../src/lib/training-ai-spend";

const h = vi.hoisted(() => ({ reserve: vi.fn(), structured: vi.fn() }));
vi.mock("../src/lib/managed-ai-operation-spend", () => ({ runWithManagedAiSpend: h.reserve }));
vi.mock("../src/lib/ai-structured", () => ({ runStructured: h.structured }));

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  h.reserve.mockReset().mockImplementation(({ operation }) => operation());
  h.structured.mockReset().mockResolvedValue({ value: "saved" });
});
afterEach(() => vi.unstubAllEnvs());

describe("request-shaped training spend bounds", () => {
  it("reserves every configured fallback attempt, including duplicate models on different paid transports", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway");
    expect(trainingAttemptModels("gpt-5.6-terra")).toEqual([
      "gpt-5.6-terra",
      "openai/gpt-5.6-terra",
      "google/gemini-3.6-flash",
      "gemini-3.6-flash",
    ]);
    const args = { text: "€".repeat(100), maxOutputTokens: 1200 };
    const one = boundedTrainingReserveUsd({ ...args, models: ["gpt-5.6-terra"] });
    const two = boundedTrainingReserveUsd({ ...args, models: ["gpt-5.6-terra", "gpt-5.6-terra"] });
    expect(two).toBeGreaterThanOrEqual(one * 2 - 0.000001);
  });

  it("uses actual UTF-8 bytes and long-context rates, rounds up, and rejects unknown pricing", () => {
    const ascii = boundedTrainingReserveUsd({
      text: "a".repeat(100),
      models: ["gpt-5.6-terra"],
      maxOutputTokens: 1200,
    });
    const unicode = boundedTrainingReserveUsd({
      text: "€".repeat(100),
      models: ["gpt-5.6-terra"],
      maxOutputTokens: 1200,
    });
    expect(unicode).toBeGreaterThan(ascii);
    expect(unicode).toBe(Math.ceil(((2348 * 2.5 + 1200 * 12) / 1e6) * 1e6) / 1e6);
    const long = boundedTrainingReserveUsd({
      text: "a".repeat(273_000),
      models: ["gpt-5.6-terra"],
      maxOutputTokens: 1200,
    });
    expect(long).toBeCloseTo((275048 * 5 + 1200 * 18) / 1e6, 6);
    expect(() =>
      boundedTrainingReserveUsd({
        text: "hello",
        models: ["unknown/expensive"],
        maxOutputTokens: 1200,
      }),
    ).toThrow("temporarily unavailable");
    expect(() =>
      boundedTrainingReserveUsd({
        text: "hello",
        models: ["unpriced/gpt-5.6-terra"],
        maxOutputTokens: 1200,
      }),
    ).toThrow("temporarily unavailable");
  });

  it("keeps ordinary short training usable within the $1.50 allowance and passes exact input to the provider after reservation", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    const options = {
      system: "Extract facts.",
      user: "Open Monday through Friday, 9 to 5.",
      tool: { name: "facts", input_schema: { type: "object" } },
      maxTokens: 1200,
    };
    await expect(
      runTrainingStructured({ userId: "tenant", source: "training", options }),
    ).resolves.toEqual({ value: "saved" });
    const args = h.reserve.mock.calls[0][0];
    expect(args).toMatchObject({
      userId: "tenant",
      action: "training.training",
      requestMeta: { source: "training" },
    });
    expect(args.reserveUsd).toBeGreaterThan(0.02);
    expect(args.reserveUsd).toBeLessThan(0.05);
    expect(h.structured).toHaveBeenCalledWith(options);
  });

  it("does not call a provider after cap refusal or unavailable pricing", async () => {
    const options = {
      system: "facts",
      user: "facts",
      tool: { name: "facts", input_schema: {} },
      maxTokens: 1200,
    };
    h.reserve.mockRejectedValueOnce(Object.assign(new Error("Review Billing"), { status: 402 }));
    await expect(
      runTrainingStructured({ userId: "tenant", source: "training", options }),
    ).rejects.toMatchObject({ status: 402 });
    expect(h.structured).not.toHaveBeenCalled();
    await expect(
      runTrainingStructured({
        userId: "tenant",
        source: "asset_text",
        options: { ...options, model: "gpt-unknown" },
      }),
    ).rejects.toMatchObject({ code: "AI_SPEND_BOUND_UNAVAILABLE" });
    expect(h.reserve).toHaveBeenCalledTimes(1);
    expect(h.structured).not.toHaveBeenCalled();
  });

  it("reserves the full Unicode website request above the old flat hold and preserves provider cancellation", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    await runTrainingStructured({
      userId: "tenant",
      source: "website",
      hostname: "example.com",
      options: {
        system: "Extract explicit facts.",
        user: "€".repeat(28_000),
        tool: { name: "facts", input_schema: { type: "object" } },
        maxTokens: 1200,
      },
    });
    expect(h.reserve.mock.calls[0][0]).toMatchObject({
      action: "website-knowledge.import",
      hostname: "example.com",
    });
    expect(h.reserve.mock.calls[0][0].reserveUsd).toBeGreaterThan(0.25);
    expect(h.structured.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(h.structured.mock.calls[0][0].signal.aborted).toBe(false);
  });

  it("bounds supported low-detail vision and refuses unavailable or unbounded models before reserve", async () => {
    const operation = vi.fn(async () => "image facts");
    await expect(
      runTrainingImage({
        userId: "tenant",
        model: "openai/gpt-5.6-terra",
        promptAndSchema: "facts",
        operation,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(h.reserve).not.toHaveBeenCalled();
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway");
    await expect(
      runTrainingImage({
        userId: "tenant",
        model: "google/gemini-3.6-flash",
        promptAndSchema: "facts",
        operation,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(operation).not.toHaveBeenCalled();
    await expect(
      runTrainingImage({
        userId: "tenant",
        model: "openai/gpt-5.6-terra",
        promptAndSchema: "facts",
        operation,
      }),
    ).resolves.toBe("image facts");
    expect(h.reserve.mock.calls[0][0].reserveUsd).toBe(
      boundedTrainingReserveUsd({
        text: "facts",
        models: ["openai/gpt-5.6-terra"],
        maxOutputTokens: 1200,
        imageTokens: 308,
      }),
    );
  });
});
