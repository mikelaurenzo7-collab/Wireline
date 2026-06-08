import { describe, expect, it } from "vitest";
import { recordGeminiUsage, withAuditCapture, estimateCost } from "./claude-audit";
import { GEMINI_MODELS } from "./claude-models";

describe("recordGeminiUsage", () => {
  it("captures Gemini token usage inside withAuditCapture", async () => {
    const { records } = await withAuditCapture(async () => {
      recordGeminiUsage(
        GEMINI_MODELS.FLASH_2_5,
        {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
        },
        42,
      );
      return "ok";
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: "google",
      model: GEMINI_MODELS.FLASH_2_5,
      input_tokens: 100,
      output_tokens: 50,
      latency_ms: 42,
    });
  });

  it("estimates Gemini cost via MODEL_PRICING", () => {
    const cost = estimateCost(
      { input_tokens: 1_000_000, output_tokens: 0 },
      GEMINI_MODELS.FLASH_2_5,
    );
    expect(cost).toBeCloseTo(0.3, 5);
  });
});
