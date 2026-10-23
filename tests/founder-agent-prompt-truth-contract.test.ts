import { describe, expect, it } from "vitest";

import {
  renderPlaybookForSystemPrompt,
  WIRELINE_OBJECTIONS,
} from "../src/lib/wireline-agent-objections";
import { WIRELINE_PERSONAS } from "../src/lib/wireline-agent-personas";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";

describe("founder agent prompt truth contract", () => {
  it("quotes launch channel capacities and exact annual prices without promoting SMS or retired benefits", () => {
    const sales = WIRELINE_PERSONAS.sales.systemPrompt;
    const current = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels");
    expect(current).toHaveLength(21);
    const launch = current.filter((plan) => !plan.channels.includes("sms"));
    expect(launch).toHaveLength(9);
    for (const plan of launch) {
      expect(sales).toContain(
        `${plan.name}: $${plan.price_usd_monthly}/mo or $${plan.price_usd_annual}/year`,
      );
    }
    for (const plan of current.filter((plan) => plan.channels.includes("sms"))) {
      expect(sales).not.toContain(`${plan.name}: $`);
    }
    expect(sales).toContain("Annual savings vary by package and capacity");
    expect(sales).toContain("never promise SMS activation or outbound calling while unavailable");
    expect(sales).toContain("only selected channels are included");
    const prompts = Object.values(WIRELINE_PERSONAS)
      .map((persona) => persona.systemPrompt)
      .join("\n");
    expect(prompts).not.toMatch(
      /BotBound (?:Starter|Pro|Scale)|Annual pricing saves two months|Pro and Scale|beyond Pro/,
    );
    expect(WIRELINE_PERSONAS.success.systemPrompt).toContain(
      "All channel plans currently include one Bot",
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
