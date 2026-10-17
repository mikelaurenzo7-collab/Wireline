import { describe, expect, it } from "vitest";

import { OPENAI_MODELS } from "../src/lib/ai-models";
import { postCallAnalysisOptions } from "../src/lib/post-call-analysis-policy";

describe("post-call enrichment model policy", () => {
  it("chooses catalogued low-cost OpenAI for starter and legacy budget jobs", () => {
    expect(postCallAnalysisOptions({ aiTier: "starter" })).toEqual({
      model: OPENAI_MODELS.GPT_5_6_LUNA,
      maxTokens: 2048,
    });
    expect(postCallAnalysisOptions({ aiTier: "team", legacyUseFlash: true })).toEqual({
      model: OPENAI_MODELS.GPT_5_6_LUNA,
      maxTokens: 2048,
    });
  });

  it("keeps the managed default and output cap for other tiers", () => {
    expect(postCallAnalysisOptions({ aiTier: "business" })).toEqual({});
    expect(postCallAnalysisOptions({})).toEqual({});
  });
});
