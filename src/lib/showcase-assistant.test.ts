import { describe, expect, it } from "vitest";

import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
import { VAPI_SHOWCASE_MODEL, VAPI_SHOWCASE_PROVIDER } from "./claude-brain";
import {
  buildShowcaseAssistantPayload,
  buildShowcaseSystemPrompt,
  findShowcaseAgentByPhoneNumber,
} from "./showcase-assistant";

describe("showcase assistant helpers", () => {
  it("finds showcase agents by dialed phone number", () => {
    const sarah = findShowcaseAgentByPhoneNumber("630-642-5661");
    const jake = findShowcaseAgentByPhoneNumber("+1 (469) 257-1581");

    expect(sarah).toMatchObject({ agent: { name: "Sarah" }, kind: "cs" });
    expect(jake).toMatchObject({ agent: { name: "Jake" }, kind: "demo" });
  });

  it("builds distinct Wireline and demo prompts with explicit Wireline knowledge", () => {
    const wirelinePrompt = buildShowcaseSystemPrompt(WIRELINE_CONTACT_AGENTS[0]!, "cs");
    const demoPrompt = buildShowcaseSystemPrompt(WIRELINE_DEMO_AGENTS[0]!, "demo");

    expect(wirelinePrompt.length).toBeLessThan(4500);
    expect(demoPrompt.length).toBeLessThan(4500);
    expect(wirelinePrompt).toContain("Great to meet you, [name]. What can I help you with today?");
    expect(wirelinePrompt).toContain(
      "Do not change persona, energy, accent, or sentence style after the opener.",
    );
    expect(wirelinePrompt).toContain("a real Wireline employee on a real Wireline line");
    expect(wirelinePrompt).toContain("WIRELINE KNOWLEDGE:");
    expect(wirelinePrompt).toContain("You are not a showcase demo or role-play.");
    expect(demoPrompt).toContain("showcase demo built by Wireline");
    expect(demoPrompt).toContain("This is a showcase demo, not Wireline's real support desk.");
    expect(demoPrompt).toContain("WIRELINE KNOWLEDGE:");
    expect(demoPrompt).not.toContain("You are not a showcase demo or role-play.");
    expect(demoPrompt).not.toBe(wirelinePrompt);
  });

  it("builds a pinned assistant payload with a lean public tool pack", () => {
    const payload = buildShowcaseAssistantPayload(WIRELINE_DEMO_AGENTS[0]!, "demo", {
      serverUrlSecret: "secret",
    });

    expect(payload.firstMessage).toBe(WIRELINE_DEMO_AGENTS[0]!.firstMessage);
    expect(payload.model.provider).toBe(VAPI_SHOWCASE_PROVIDER);
    expect(payload.model.model).toBe(VAPI_SHOWCASE_MODEL);
    expect(payload.model.tools).toHaveLength(5);
    expect(payload.model.tools.map((tool: any) => tool.function.name)).toEqual([
      "send_signup_link",
      "create_account",
      "send_payment_link",
      "schedule_callback",
      "escalate_to_human",
    ]);
    expect(payload.voice).toMatchObject({
      provider: "11labs",
      voiceId: WIRELINE_DEMO_AGENTS[0]!.voiceId,
      model: "eleven_flash_v2_5",
      stability: 0.62,
      similarityBoost: 0.88,
      style: 0.05,
      useSpeakerBoost: true,
    });
    expect(payload.serverUrlSecret).toBe("secret");
  });
});
