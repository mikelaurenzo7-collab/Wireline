import { describe, expect, it } from "vitest";

import {
  renderPlaybookForSystemPrompt,
  WIRELINE_OBJECTIONS,
} from "../src/lib/wireline-agent-objections";
import { WIRELINE_PERSONAS } from "../src/lib/wireline-agent-personas";

describe("founder agent prompt truth contract", () => {
  it("keeps objection handling free of unsupported comparisons and demo promises", () => {
    const playbook = renderPlaybookForSystemPrompt();

    expect(playbook).not.toMatch(/typically a third|best AI voice on the planet/i);
    expect(playbook).not.toMatch(
      /most callers don't realize|thirty seconds|confirm in one second/i,
    );
    expect(playbook).not.toMatch(/Calendly|Zapier covers anything else/i);
    expect(playbook).toContain("published plan and usage rates");
    expect(playbook).toContain("confirm its current status");
  });

  it("describes transfer, transcript, and recording evidence conditionally", () => {
    const mistake = WIRELINE_OBJECTIONS.find((entry) => entry.id === "what_if_mistake");

    expect(mistake?.response_template).toContain("configured human destination");
    expect(mistake?.response_template).toContain(
      "transcripts or recordings only when the enabled workflow produced them",
    );
    expect(mistake?.response_template).not.toMatch(
      /every call is recorded|it transfers to a human/i,
    );
  });

  it("keeps founder personas conditional on configured tools and avoids response-time claims", () => {
    const prompts = Object.values(WIRELINE_PERSONAS)
      .map((persona) => persona.systemPrompt)
      .join("\n");

    expect(prompts).toContain("when a configured destination is available");
    expect(prompts).toContain("when the scheduling tool is available");
    expect(prompts).toContain(
      "Live activation depends on plan, number, provider, and compliance readiness.",
    );
    expect(prompts).not.toMatch(/Calendly|call you back in 10 minutes|live in under 10 minutes/i);
    expect(prompts).not.toMatch(/BotBound almost always wins|Book a Calendly/i);
    expect(prompts).not.toMatch(
      /Trigger a password reset|Resend a receipt|Confirm the cancellation|Handle a plan upgrade/i,
    );
    expect(prompts).toContain("Never claim a reset email was sent.");
    expect(prompts).toMatch(/never claim the subscription changed from the call alone/i);
    expect(prompts).toContain("use create_support_ticket");
  });
});
