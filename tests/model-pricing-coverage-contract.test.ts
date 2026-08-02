import { describe, expect, it } from "vitest";
import { GEMINI_MODELS, MODEL_PRICING, OPENAI_MODELS, XAI_MODELS } from "../src/lib/ai-models";

/**
 * Every model id the runtime can select must carry a pricing row, and the
 * rows must stay shaped like the vendors actually bill. pricingFor() in
 * ai-audit silently falls back to GPT-5.6 Terra pricing for unknown ids, so
 * a missing row here means audited spend is quietly mispriced.
 */
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

  it("keeps rows shaped like real vendor billing", () => {
    for (const [id, row] of Object.entries(MODEL_PRICING)) {
      expect(row.input, `${id} input rate`).toBeGreaterThan(0);
      expect(row.output, `${id} output rate`).toBeGreaterThan(0);
      expect(row.output, `${id} output should not undercut input`).toBeGreaterThanOrEqual(
        row.input,
      );
      expect(row.cacheRead, `${id} cached input must discount full input`).toBeLessThan(row.input);
      // OpenAI, Google, and xAI charge nothing to write prompt cache; a
      // nonzero cacheWrite here is a mispriced vendor assumption.
      expect(row.cacheWrite, `${id} cacheWrite`).toBe(0);
    }
  });
});
