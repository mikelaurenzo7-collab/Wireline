import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectorModelAllowlistCache,
  directorStreamMetaModel,
  resolveDirectorModelSelection,
  validateDirectorChatModelSelection,
} from "./director-model-policy";

vi.mock("./openrouter-models", () => ({
  isOpenRouterConfigured: vi.fn(() => true),
  listOpenRouterModelsForDirector: vi.fn(async () => ({
    enabled: true,
    curated: [
      { id: "openai/gpt-4o", label: "GPT-4o", description: "", category: "creative" as const },
    ],
    catalog: [
      { id: "openai/gpt-4o", label: "GPT-4o", description: "", category: "creative" as const },
    ],
  })),
}));

describe("validateDirectorChatModelSelection", () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    clearDirectorModelAllowlistCache();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = prevAnthropic;
  });

  it("rejects openrouter models outside the catalog", async () => {
    const result = await validateDirectorChatModelSelection({
      provider: "openrouter",
      modelId: "evil/unknown-model",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("accepts catalog openrouter models", async () => {
    const result = await validateDirectorChatModelSelection({
      provider: "openrouter",
      modelId: "openai/gpt-4o",
    });
    expect(result.ok).toBe(true);
  });
});

describe("resolveDirectorModelSelection", () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    clearDirectorModelAllowlistCache();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = prevAnthropic;
  });

  it("rejects forged modelSelection in the request body", async () => {
    const result = await resolveDirectorModelSelection(
      "user-1",
      { modelSelection: { provider: "openrouter", modelId: "not-in-catalog/x" } },
      async () => ({ provider: "wireline", tier: "auto" }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("directorStreamMetaModel", () => {
  it("marks custom OpenRouter models without deep flag", () => {
    expect(directorStreamMetaModel({ modelKind: "custom", deepThink: false })).toEqual({
      model: "custom",
      deep: false,
    });
  });

  it("preserves opus deep streaming metadata", () => {
    expect(directorStreamMetaModel({ modelKind: "opus", deepThink: true })).toEqual({
      model: "opus",
      deep: true,
    });
  });
});
