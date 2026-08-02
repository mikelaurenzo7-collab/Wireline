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

  it("keeps cached reads below ordinary input and records GPT-5.6 write premiums", () => {
    for (const [id, row] of Object.entries(MODEL_PRICING)) {
      expect(row.input, `${id} input rate`).toBeGreaterThan(0);
      expect(row.output, `${id} output rate`).toBeGreaterThanOrEqual(row.input);
      expect(row.cacheRead, `${id} cached input`).toBeLessThan(row.input);
      expect(row.cacheWrite, `${id} cache write`).toBeGreaterThanOrEqual(0);
    }
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_TERRA].cacheWrite).toBe(2.5);
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_LUNA].cacheWrite).toBe(0.25);
    expect(MODEL_PRICING[OPENAI_MODELS.GPT_5_6_SOL].cacheWrite).toBe(6.25);
  });

  it("applies vendor long-context rates to the full request", () => {
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_TERRA, 272_000).input).toBe(2);
    expect(pricingForModel(OPENAI_MODELS.GPT_5_6_TERRA, 272_001)).toEqual({
      input: 4,
      output: 18,
      cacheRead: 0.4,
      cacheWrite: 5,
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
    expect(cost.inputCost).toBeCloseTo(0.4);
    expect(cost.cacheReadCost).toBeCloseTo(0.04);
    expect(cost.cacheWriteCost).toBeCloseTo(0.5);
    expect(cost.outputCost).toBeCloseTo(0.18);
  });
});
