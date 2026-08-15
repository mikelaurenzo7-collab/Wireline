import { describe, expect, it } from "vitest";

import {
  FOUNDER_FLEET_TEAMS,
  FOUNDER_FLEET_TEMPLATES,
  knowledgeForRole,
  wirelinePlanFacts,
} from "../src/lib/founder-fleet-seed";
import { plansForClient } from "../src/lib/plan-catalog";
import { pickRotatedVoiceId } from "../src/data/voice-roster";
import { WIRELINE_PERSONAS } from "../src/lib/wireline-agent-personas";

/**
 * The founder fleet is the account that sells and serves Wireline itself, so it
 * is also the account a prospect hears first. These are functional checks
 * against the seed's real output rather than source reads.
 */
describe("founder fleet composition", () => {
  it("keeps every business agent serving Wireline, not a demo vertical", () => {
    // The roster previously carried vertical role-play (a real-estate closer
    // asking about "listings", an insurance desk asking for a "policy number").
    // That belongs to the public demo lines, not the account running Wireline.
    const verticalRolePlay = /listings?|policy number|claim number|patient|prescription/i;
    for (const template of FOUNDER_FLEET_TEMPLATES) {
      if (template.isBusinessAgent === false) continue;
      expect(
        verticalRolePlay.test(template.firstMessage),
        `${template.name} opens with vertical role-play: ${template.firstMessage}`,
      ).toBe(false);
    }
  });

  it("assigns every template to a known operating pod", () => {
    for (const template of FOUNDER_FLEET_TEMPLATES) {
      expect(FOUNDER_FLEET_TEAMS).toContain(template.team);
    }
    // Each pod that sells or serves must actually be staffed.
    const staffed = new Set(FOUNDER_FLEET_TEMPLATES.map((t) => t.team));
    for (const pod of ["revenue", "support", "retention", "front_door"] as const) {
      expect(staffed, `pod ${pod} has no agent`).toContain(pod);
    }
  });

  it("teaches the fleet the live plan catalog instead of hardcoded prices", () => {
    const facts = wirelinePlanFacts().join("\n");
    const plans = plansForClient();
    expect(plans.length).toBeGreaterThan(1);

    // Every public plan — not just the free tier — must reach the agents. A
    // hand-rolled `plan.public` filter once dropped every paid launch plan, which
    // would have put a fleet on the phone that only knew Free Builder.
    for (const plan of plans) {
      expect(facts, `${plan.name} missing from plan facts`).toContain(plan.name);
      if (plan.price_usd_monthly > 0) {
        expect(facts).toContain(`$${plan.price_usd_monthly}/month`);
        expect(facts).toContain(`$${plan.price_usd_annual}/year`);
      }
    }

    // Retired pricing must never survive in seeded knowledge.
    for (const retired of ["$9/month", "$29/month", "$49/month", "$99/year"]) {
      expect(facts).not.toContain(retired);
    }

    // Guardrail so a seeded agent cannot improvise commercial terms.
    expect(facts).toMatch(/escalate instead of inventing an offer/i);
  });

  it("gives every selling role its own playbook without shadowing later roles", () => {
    // knowledgeForRole used an early-return chain where the sales branch also
    // captured `marketing`, leaving the marketing snippets unreachable — the
    // Growth Coordinator never received its campaign knowledge.
    const marketing = knowledgeForRole("marketing");
    expect(marketing.some((line) => line.includes("Campaign brief template"))).toBe(true);
    expect(marketing.some((line) => line.includes("Lead with outcome before features"))).toBe(true);

    expect(knowledgeForRole("collections").some((l) => l.includes("verify identity"))).toBe(true);
    expect(
      knowledgeForRole("technical_support").some((l) => l.includes("Diagnose in this order")),
    ).toBe(true);
    expect(knowledgeForRole("scheduler").some((l) => l.includes("timezone"))).toBe(true);

    // Sales roles must carry the disclosure-honest objection handling.
    const sales = knowledgeForRole("sales");
    expect(sales.some((l) => /never claim an agent passes as human/i.test(l))).toBe(true);

    // No duplicates once roles overlap.
    for (const role of ["sales", "marketing", "customer_service", "technical_support"]) {
      const lines = knowledgeForRole(role);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  it("keeps the personal agent out of the commercial lane", () => {
    const personal = knowledgeForRole("personal_assistant");
    expect(personal.some((line) => line.includes("/month"))).toBe(false);
    expect(personal.some((line) => line.includes("Lead with outcome"))).toBe(false);
  });

  it("spreads managed voices across the seeded fleet", () => {
    // Every founder agent used to speak as the same voice, so a caller routed
    // sales -> support -> billing heard one identical person.
    const total = Object.keys(WIRELINE_PERSONAS).length + FOUNDER_FLEET_TEMPLATES.length;
    const voices = Array.from({ length: total }, (_, index) => pickRotatedVoiceId(index));
    expect(new Set(voices).size).toBeGreaterThanOrEqual(8);
    // Adjacent agents must never share a voice.
    for (let i = 1; i < voices.length; i++) {
      expect(voices[i]).not.toBe(voices[i - 1]);
    }
  });
});
