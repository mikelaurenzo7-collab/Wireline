import { describe, expect, it } from "vitest";
import { estimateCostDetailed } from "../src/lib/ai-audit";
import {
  GEMINI_MODELS,
  MODEL_PRICING,
  OPENAI_MODELS,
  OPENAI_SOL_PROMOTIONAL_PRICING_REVIEW_DATE,
  OPENAI_TEXT_PRICING_EFFECTIVE_DATE,
  pricingForModel,
  selectModelForTask,
} from "../src/lib/ai-models";

// Pricing provenance verified 2026-08-31 against vendor-owned documentation:
// https://developers.openai.com/api/docs/models/gpt-5.6-terra
// https://developers.openai.com/api/docs/models/gpt-5.6-luna
// https://developers.openai.com/api/docs/models/gpt-5.6-sol
// https://ai.google.dev/gemini-api/docs/pricing

describe("model pricing coverage contract", () => {
  const declaredIds = [
    ...Object.values(OPENAI_MODELS),
    ...Object.values(GEMINI_MODELS),
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

    expect(OPENAI_TEXT_PRICING_EFFECTIVE_DATE).toBe("2026-07-30");
    expect(OPENAI_SOL_PROMOTIONAL_PRICING_REVIEW_DATE).toBe("2026-11-21");
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_TERRA]).toEqual({
      input: 2,
      output: 12,
      cacheRead: 0.2,
      cacheWrite: 2.5,
    });
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_LUNA]).toEqual({
      input: 0.2,
      output: 1.2,
      cacheRead: 0.02,
      cacheWrite: 0.25,
    });
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_SOL]).toEqual({
      input: 4,
      output: 20,
      cacheRead: 0.4,
      cacheWrite: 5,
    });
  });

  it("applies current vendor long-context rates to the full request", () => {
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_TERRA, 272_000)).toEqual({
      input: 2,
      output: 12,
      cacheRead: 0.2,
      cacheWrite: 2.5,
    });
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_TERRA, 272_001)).toEqual({
      input: 4,
      output: 18,
      cacheRead: 0.4,
      cacheWrite: 5,
    });
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_LUNA, 272_001)).toEqual({
      input: 0.4,
      output: 1.8,
      cacheRead: 0.04,
      cacheWrite: 0.5,
    });
    expect(pricingForModel(GEMINI_MODELS.PRO_3_1, 200_001).output).toBe(18);
  });

  it("keeps workload complexity on the OpenAI primary model and prices cache writes accurately", () => {
    expect(selectModelForTask("simple")).toBe(OPENAI_MODELS.GPT_5_6_TERRA);
    expect(selectModelForTask("medium")).toBe(OPENAI_MODELS.GPT_5_6_TERRA);
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
    expect(cost.inputCost).toBeCloseTo(0.4);
    expect(cost.cacheReadCost).toBeCloseTo(0.04);
    expect(cost.cacheWriteCost).toBeCloseTo(0.5);
    expect(cost.outputCost).toBeCloseTo(0.18);
    expect(cost.totalCost).toBeCloseTo(1.12);
  });
});
