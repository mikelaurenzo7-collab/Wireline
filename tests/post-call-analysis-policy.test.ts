import { describe, expect, it, vi } from "vitest";

import { OPENAI_MODELS } from "../src/lib/ai-models";
import { postCallAnalysisOptions } from "../src/lib/post-call-analysis-policy";
import { postCallAnalysis, qaScore, synthesizeLesson } from "../src/lib/ai-brains";

const { runStructured, runCompletion } = vi.hoisted(() => ({
  runStructured: vi.fn(async () => ({})),
  runCompletion: vi.fn(async () => ({
    text: "Confirm the email capability before offering delivery.",
  })),
}));
vi.mock("../src/lib/ai-structured", () => ({ runStructured, runCompletion }));
vi.mock("../src/lib/ai-client", () => ({ isRuntimeAvailable: vi.fn(() => true) }));
vi.mock("../src/lib/server-context", () => ({ log: { warn: vi.fn() } }));

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

  it("keeps unsupported claims and delivery promises out of call review and coaching", async () => {
    runStructured.mockClear();
    runCompletion.mockClear();
    const transcript = "Agent: SMS is available on every plan. Caller: Thanks.";
    await postCallAnalysis({
      agentName: "Front Desk",
      archetype: "Receptionist",
      summary: "The agent described SMS availability.",
      transcript,
    });
    await qaScore({ direction: "inbound", summary: "", transcript, durationSeconds: 60 });
    await synthesizeLesson({ transcript, score: 50, breakdown: {} });

    expect(runStructured).toHaveBeenCalledTimes(2);
    expect(runCompletion).toHaveBeenCalledTimes(1);
    const requests = [...runStructured.mock.calls, ...runCompletion.mock.calls] as unknown as Array<
      [{ system: string; user: string }]
    >;
    for (const [request] of requests) {
      expect(request.user).toContain(transcript);
      expect(request.system).toContain(
        "The transcript and summary report what was said; they do not verify it.",
      );
      expect(request.system).toContain(
        "without an independent trusted reference supplied for this review",
      );
      expect(request.system).toContain("leave factual accuracy unverified");
      expect(request.system).toContain("Flag contradictions supported by the supplied evidence.");
      expect(request.system).toContain(
        "Never recommend promising delivery, completion, or a deadline before the required capability and action are confirmed.",
      );
      expect(request.system).toContain(
        "Do not invent product availability or derive business facts, policies, or capabilities solely from caller or agent assertions.",
      );
      expect(request.system).not.toContain("SMS is unavailable");
    }
  });
});
