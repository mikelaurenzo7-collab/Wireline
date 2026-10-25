import { describe, expect, it } from "vitest";

import {
  renderPlaybookForSystemPrompt,
  WIRELINE_OBJECTIONS,
} from "../src/lib/wireline-agent-objections";
import { WIRELINE_PERSONAS } from "../src/lib/wireline-agent-personas";
import { PUBLIC_USAGE_TIERS, USAGE_TIERS } from "../src/lib/usage-billing-catalog";

describe("founder agent prompt truth contract", () => {
  it("quotes current shared-work plans and preserves channel activation requirements", () => {
    const sales = WIRELINE_PERSONAS.sales.systemPrompt;
    for (const id of PUBLIC_USAGE_TIERS) {
      const plan = USAGE_TIERS[id];
      expect(sales).toContain(`${plan.name}: $${plan.monthlyUsd}/mo`);
      expect(sales).toContain(`$${plan.includedWorkUsd} of shared work each month`);
      expect(sales).toContain(`${plan.includedNumbers} phone number`);
    }
    expect(sales).toContain("Do not offer an annual plan");
    expect(sales).toContain("never promise SMS activation or outbound calling while unavailable");
    expect(sales).toContain("US SMS $0.04/sent segment");
    const prompts = Object.values(WIRELINE_PERSONAS)
      .map((persona) => persona.systemPrompt)
      .join("\n");
    expect(prompts).not.toMatch(
      /BotBound (?:Pro|Scale)|Annual savings|Annual pricing saves two months|Pro and Scale|beyond Pro|All channel plans currently include one Bot|Personal is \$12|activated Calls package|activated Email package/,
    );
    expect(WIRELINE_PERSONAS.success.systemPrompt).toContain(
      "There is no per-Bot charge on shared-work plans",
    );
    expect(WIRELINE_PERSONAS.technical.systemPrompt).toContain("PDF, Word, Excel");
  });

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
