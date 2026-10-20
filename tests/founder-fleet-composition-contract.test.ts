import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXPECTED_FOUNDER_FLEET_AGENT_COUNT,
  EXPECTED_FOUNDER_PERSONA_COUNT,
  FOUNDER_FLEET_TEAMS,
  FOUNDER_FLEET_TEMPLATES,
  founderFleetExistingAgentPatch,
  founderFleetSeedNeedsRefresh,
  knowledgeForRole,
  personalityForTemplate,
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
  it("keeps every managed persona's spoken identity consistent", () => {
    for (const persona of Object.values(WIRELINE_PERSONAS)) {
      expect(persona.firstMessage).toContain(persona.name);
      expect(persona.systemPrompt).toContain(`You are ${persona.name}`);
    }
    expect(WIRELINE_PERSONAS.sales.systemPrompt).toContain("Casey's confident, calm identity");
    expect(WIRELINE_PERSONAS.sales.systemPrompt).not.toContain("Jake");
  });

  it("refreshes managed metadata without replacing dogfooded Studio configuration", () => {
    const patch = founderFleetExistingAgentPatch(
      {
        custom_training_setting: "keep me",
        founder_seed_contract_version: 1,
      },
      {
        founder_fleet_seed: true,
        founder_seed_contract_version: 7,
        team: "revenue",
      },
      "pulse-violet",
    );

    expect(patch).toEqual({
      businessVariables: {
        custom_training_setting: "keep me",
        founder_fleet_seed: true,
        founder_seed_contract_version: 7,
        team: "revenue",
      },
      markKey: "pulse-violet",
    });
    expect(patch).not.toHaveProperty("voiceId");
    expect(patch).not.toHaveProperty("firstMessage");
    expect(patch).not.toHaveProperty("personalityVibe");
    expect(patch).not.toHaveProperty("enabledTools");

    const source = readFileSync(resolve(process.cwd(), "src/lib/founder-fleet-seed.ts"), "utf8");
    expect(source).toContain("async function ensurePersonality");
    expect(source).not.toContain(".set({ content })");
    expect(source).not.toContain(".set({ enabledTools: ALL_AGENT_TOOLS })");
    const existingBranch = source.slice(
      source.indexOf("    if (existing) {", source.indexOf("async function upsertAgent")),
      source.indexOf('return { kind: "updated", agentId } as const;'),
    );
    expect(existingBranch).toMatch(
      /founder_seed_contract_version !==\s*FOUNDER_FLEET_SEED_CONTRACT_VERSION/,
    );
    expect(existingBranch).toContain(
      "await seedTrainingArtifacts(agentId, userId, template.role, report, tx)",
    );
    const creationBranch = source.slice(
      source.indexOf("    await tx.insert(schema.agents)"),
      source.indexOf('return { kind: "created", agentId } as const;'),
    );
    expect(creationBranch).toContain(
      "await seedTrainingArtifacts(agentId, userId, template.role, report, tx)",
    );
    expect(source.slice(source.indexOf("  const ownerAgents ="))).not.toContain(
      "seedTrainingArtifacts",
    );
  });

  it("retries when only the internal personas completed the current seed contract", () => {
    const baseState = {
      totalAgents: EXPECTED_FOUNDER_FLEET_AGENT_COUNT,
      businessAgents: EXPECTED_FOUNDER_FLEET_AGENT_COUNT - 1,
      personalAgents: 1,
    };

    expect(
      founderFleetSeedNeedsRefresh({
        ...baseState,
        currentManagedContracts: EXPECTED_FOUNDER_PERSONA_COUNT,
      }),
    ).toBe(true);
    expect(
      founderFleetSeedNeedsRefresh({
        ...baseState,
        currentManagedContracts: EXPECTED_FOUNDER_FLEET_AGENT_COUNT,
      }),
    ).toBe(false);
  });

  it("persists the exact internal persona policy into each live founder Bot", () => {
    for (const persona of Object.values(WIRELINE_PERSONAS)) {
      const persisted = personalityForTemplate({
        role: persona.role,
        systemPrompt: persona.systemPrompt,
      });
      expect(persisted).toContain(persona.systemPrompt);
      expect(persisted).toContain("CHAT MODE (operator workspace)");
    }

    const supportPrompt = WIRELINE_PERSONAS.support.systemPrompt;
    expect(supportPrompt).toContain("use create_support_ticket");
    expect(supportPrompt).not.toMatch(/auto-issue|within 24 hours/i);

    const allPrompts = Object.values(WIRELINE_PERSONAS)
      .map((persona) => persona.systemPrompt)
      .join("\n");
    expect(allPrompts).toContain("We do not currently claim HIPAA compliance or offer BAA support");
    expect(allPrompts).not.toMatch(/HIPAA mode|SOC 2 Type 2 in progress|never train models/i);
  });

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

  it("teaches current launch plans from the catalog without offering retained SMS packages", () => {
    const facts = wirelinePlanFacts().join("\n");
    const plans = plansForClient();
    const launchPlans = plans.filter(
      (plan) =>
        plan.is_free || (plan.catalog_family === "channels" && !plan.channels.includes("sms")),
    );
    expect(launchPlans).toHaveLength(10);

    // Every launch package keeps its exact canonical price and capacity. SMS
    // remains in billing for existing subscribers without becoming sales copy.
    for (const plan of launchPlans) {
      expect(facts, `${plan.name} missing from plan facts`).toContain(plan.name);
      if (plan.price_usd_monthly > 0) {
        expect(facts).toContain(
          `${plan.name}: $${plan.price_usd_monthly}/month or $${plan.price_usd_annual}/year`,
        );
      }
    }
    for (const plan of plans.filter((plan) => plan.channels.includes("sms"))) {
      expect(facts).not.toContain(`${plan.name}:`);
    }

    // Prices can recur in different offers; reject retired identities and
    // unsupported benefits rather than forbidding valid channel amounts.
    expect(facts).not.toMatch(/BotBound (?:Starter|Pro|Scale|Business)\b/);
    expect(facts).not.toMatch(
      /Additional agents are an add-on|Every paid Bot includes|never cut mid conversation/,
    );
    expect(facts).toContain("Extra Bots are not available as add ons");
    expect(facts).toContain("one call at a time");
    expect(facts).toContain(
      "up to 10 minutes of completion credit within the call's duration limit",
    );
    expect(facts).toContain("SMS activation is unavailable");
    const email = facts.split("\n").find((line) => line.startsWith("BotBound Email Light:"))!;
    expect(email).toContain("Calls not included, no included number, 1 managed mailbox");
    expect(email).not.toContain("until a paid plan is active");
    const emailPlan = launchPlans.find((plan) => plan.id === "email")!;
    if (emailPlan.contact_sales) {
      expect(email).toContain("Email activation requires a setup review");
    }
    expect(facts).toContain("Reviewed personal coordination");
    expect(facts).toContain("supported caller and recipient locations in Illinois");
    expect(facts).toContain("Marketing and sales call campaigns are unavailable");
    expect(knowledgeForRole("customer_service").join("\n")).not.toContain(
      "work across voice, text, and email",
    );

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
