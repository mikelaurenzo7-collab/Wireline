import { describe, expect, it } from "vitest";
import { estimateCostDetailed } from "../src/lib/ai-audit";
import {
  GEMINI_MODELS,
  MODEL_PRICING,
  OPENAI_MODELS,
  XAI_MODELS,
  pricingForModel,
  selectModelForTask,
} from "../src/lib/ai-models";

describe("model pricing coverage contract", () => {
  const declaredIds = [
    ...Object.values(OPENAI_MODELS),
    ...Object.values(GEMINI_MODELS),
    ...Object.values(XAI_MODELS),
  ];

  it("prices every declared model id", () => {
    for (const id of declaredIds) {
      expect(
        MODEL_PRICING[id as keyof typeof MODEL_PRICING],
        `missing pricing for ${id}`,
      ).toBeDefined();
    }
  });

  it("pins current GPT-5.6 standard rates and cache-write premiums", () => {
    for (const [id, row] of Object.entries(MODEL_PRICING)) {
      expect(row.input, `${id} input rate`).toBeGreaterThan(0);
      expect(row.output, `${id} output rate`).toBeGreaterThanOrEqual(row.input);
      expect(row.cacheRead, `${id} cached input`).toBeLessThan(row.input);
      expect(row.cacheWrite, `${id} cache write`).toBeGreaterThanOrEqual(0);
    }

    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_TERRA]).toEqual({
      input: 2.5,
      output: 15,
      cacheRead: 0.25,
      cacheWrite: 3.125,
    });
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_LUNA]).toEqual({
      input: 1,
      output: 6,
      cacheRead: 0.1,
      cacheWrite: 1.25,
    });
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_SOL]).toEqual({
      input: 5,
      output: 30,
      cacheRead: 0.5,
      cacheWrite: 6.25,
    });
  });

  it("applies current vendor long-context rates to the full request", () => {
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_TERRA, 272_000)).toEqual({
      input: 2.5,
      output: 15,
      cacheRead: 0.25,
      cacheWrite: 3.125,
    });
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_TERRA, 272_001)).toEqual({
      input: 5,
      output: 22.5,
      cacheRead: 0.5,
      cacheWrite: 6.25,
    });
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_LUNA, 272_001)).toEqual({
      input: 2,
      output: 9,
      cacheRead: 0.2,
      cacheWrite: 2.5,
    });
    expect(pricingForModel(XAI_MODELS.GROK_4_5, 200_000).input).toBe(4);
    expect(pricingForModel(GEMINI_MODELS.PRO_3_1, 200_001).output).toBe(18);
  });

  it("routes current low-complexity work to Luna and prices cache writes accurately", () => {
    expect(selectModelForTask("simple")).toBe(OPENAI_MODELS.GPT_5_6_LUNA);
    expect(selectModelForTask("complex")).toBe(OPENAI_MODELS.GPT_5_6_TERRA);

    const cost = estimateCostDetailed(
      {
        input_tokens: 100_000,
        cache_read_input_tokens: 100_000,
        cache_creation_input_tokens: 100_000,
        output_tokens: 10_000,
      },
      OPENAI_MODELS.GPT_5_6_TERRA,
    );
    // 300k total prompt tokens crosses the OpenAI long-context tier.
    expect(cost.inputCost).toBeCloseTo(0.5);
    expect(cost.cacheReadCost).toBeCloseTo(0.05);
    expect(cost.cacheWriteCost).toBeCloseTo(0.625);
    expect(cost.outputCost).toBeCloseTo(0.225);
    expect(cost.totalCost).toBeCloseTo(1.4);
  });
});