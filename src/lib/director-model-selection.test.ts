import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIRECTOR_MODEL_SELECTION,
  isOpenRouterModelId,
  parseDirectorChatModelSelection,
  resolveDirectorLlm,
} from "./director-model-selection";

describe("parseDirectorChatModelSelection", () => {
  it("accepts wireline tiers", () => {
    expect(parseDirectorChatModelSelection({ provider: "wireline", tier: "auto" })).toEqual({
      provider: "wireline",
      tier: "auto",
    });
    expect(parseDirectorChatModelSelection({ provider: "wireline", tier: "opus" })).toEqual({
      provider: "wireline",
      tier: "opus",
    });
  });

  it("rejects invalid openrouter ids", () => {
    expect(
      parseDirectorChatModelSelection({ provider: "openrouter", modelId: "../evil" }),
    ).toBeNull();
    expect(parseDirectorChatModelSelection({ provider: "openrouter", modelId: "" })).toBeNull();
  });

  it("accepts valid openrouter ids", () => {
    expect(
      parseDirectorChatModelSelection({
        provider: "openrouter",
        modelId: "anthropic/claude-sonnet-4.6",
      }),
    ).toEqual({ provider: "openrouter", modelId: "anthropic/claude-sonnet-4.6" });
  });
});

describe("resolveDirectorLlm", () => {
  const claude = { claudeSonnet: "sonnet-id", claudeOpus: "opus-id" };

  it("defaults to wireline auto sonnet", () => {
    const r = resolveDirectorLlm({ ...claude, selection: DEFAULT_DIRECTOR_MODEL_SELECTION });
    expect(r.provider).toBe("wireline");
    expect(r.model).toBe("sonnet-id");
    expect(r.deepThink).toBe(false);
  });

  it("routes openrouter without deep think", () => {
    const r = resolveDirectorLlm({
      ...claude,
      selection: { provider: "openrouter", modelId: "openai/gpt-4o" },
      modelLabelForOpenRouter: () => "GPT-4o",
    });
    expect(r.provider).toBe("openrouter");
    expect(r.model).toBe("openai/gpt-4o");
    expect(r.deepThink).toBe(false);
    expect(r.modelLabel).toBe("GPT-4o");
  });
});

describe("isOpenRouterModelId", () => {
  it("allows vendor/model paths", () => {
    expect(isOpenRouterModelId("anthropic/claude-sonnet-4.6")).toBe(true);
    expect(isOpenRouterModelId("meta-llama/llama-3.3-70b-instruct")).toBe(true);
  });
});
