import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isBusinessTemplateCategory,
  PERSONAL_DEFAULT_TEMPLATE_ID,
  PERSONAL_FAST_START_ROLE,
  resolveCreateEnabledTools,
  resolveCreatePersonality,
} from "../src/lib/agent-create-defaults";
import {
  applyPlanToolUnlocks,
  BUSINESS_TOOL_NAMES,
  getDefaultAgentTools,
  getRoleToolSet,
  resolveAgentTools,
} from "../src/lib/agent-capabilities";
import { PRODUCT_POSTURE } from "../src/lib/product-copy";
import { composeSetupPersonality } from "../src/lib/compose-setup-personality";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("personal agent parity — create defaults", () => {
  it("defaults personal Fast Start to personal_assistant with concierge overlay", () => {
    expect(PERSONAL_FAST_START_ROLE).toBe("personal_assistant");
    expect(PERSONAL_DEFAULT_TEMPLATE_ID).toBe("personal-concierge");
    const personality = resolveCreatePersonality({
      role: PERSONAL_FAST_START_ROLE,
      isBusinessAgent: false,
      agentName: "Sarah",
    });
    expect(personality).toBeTruthy();
    expect(personality!).toContain("elite personal assistant");
    expect(personality!).toContain("TEMPLATE SPECIALTY — Personal Concierge");
    expect(personality!).toContain("You represent your principal");
    expect(personality!).not.toContain("You represent Sarah");
    expect(personality!).not.toContain("your business — a single individual");
  });

  it("never substitutes the agent name as the company in business templates", () => {
    const personality = resolveCreatePersonality({
      role: "sales",
      isBusinessAgent: true,
      templateId: "sales-sdr",
      agentName: "Revenue Desk",
    });
    expect(personality).toContain("from your business");
    expect(personality).not.toContain("from Revenue Desk");
  });

  it("seeds role-focused tools while keeping the full catalog selectable", () => {
    const personalTools = resolveCreateEnabledTools("personal_assistant", false);
    const businessTools = resolveCreateEnabledTools("sales", true);
    const deviceActions = ["navigate_to", "add_reminder", "play_music"] as const;

    expect(personalTools.length).toBeGreaterThan(0);
    for (const tool of personalTools) {
      expect(BUSINESS_TOOL_NAMES.has(tool)).toBe(false);
    }
    for (const tool of deviceActions) {
      expect(personalTools).not.toContain(tool);
      expect(businessTools).not.toContain(tool);
    }

    expect(businessTools.length).toBeLessThan(getDefaultAgentTools().length);
    expect(businessTools).toContain("send_email");
    expect(businessTools).toContain("book_appointment");
    expect(businessTools).toContain("crm_create_opportunity");
    expect(businessTools).toContain("send_contract");
    expect(businessTools).not.toContain("shopify_cancel_order");
    expect(businessTools).not.toContain("post_x_tweet");

    expect(personalTools).toContain("book_appointment");
    expect(personalTools).toContain("send_text_message");
    expect(personalTools).not.toContain("crm_log_call");
    expect(personalTools).not.toContain("search_leads");
    expect(personalTools).not.toContain("send_slack_notification");
    expect(personalTools).not.toContain("send_teams_message");
  });

  it("keeps explicit selections authoritative through plan entitlement", () => {
    const selected = ["send_email", "book_appointment"] as const;
    expect(applyPlanToolUnlocks(selected, "enterprise")).toEqual(selected);
    expect(resolveAgentTools("sales", selected)).toEqual(selected);

    const personalRole = getRoleToolSet("personal_assistant");
    expect(personalRole).not.toContain("send_slack_notification");
    expect(personalRole).not.toContain("send_teams_message");
    expect(personalRole).not.toContain("send_contract");

    // Legacy agents without enabled_tools retain the entire catalog.
    expect(resolveAgentTools("sales", null)).toEqual(getDefaultAgentTools());
  });

  it("marks Personal & Lifestyle templates as non-business", () => {
    expect(isBusinessTemplateCategory("Personal & Lifestyle")).toBe(false);
    expect(isBusinessTemplateCategory("Sales & Revenue")).toBe(true);
    expect(isBusinessTemplateCategory(null)).toBe(true);
  });
});

describe("personal agent parity — presentation and runtime", () => {
  it("keeps Fast Start from overwriting server-seeded personality with a thin stub", () => {
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    expect(createDialog).toContain('value: "personal_assistant"');
    expect(createDialog).toContain("personalOnly: true");
    expect(createDialog).toContain(
      'return posture === "business" ? "sales" : "personal_assistant"',
    );
    expect(createDialog).not.toContain("Warm. Concise. Useful.");
    expect(createDialog).not.toContain('type: "personality"');
  });

  it("wires template deploy and mobile create through the same posture-aware seeding", () => {
    const templates = read("src/components/AgentTemplates.tsx");
    const mobile = read("src/routes/mobile-routes.ts");
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    expect(templates).toContain("isBusinessTemplateCategory(modalTemplate.category)");
    expect(mobile).toContain("resolveCreateEnabledTools(role, isBusinessAgent)");
    expect(mobile).toContain("resolveCreatePersonality");
    expect(agentRoutes).toContain("resolveCreatePersonality");
    expect(agentRoutes).toContain("resolveCreateEnabledTools(role, isBusinessAgent)");
  });

  it("uses personal Studio / Overview / Vapi language instead of business-customer defaults", () => {
    const panel = read("src/components/StudioAgentWorkspacePanel.tsx");
    const toneCompose = read("src/lib/compose-setup-personality.ts");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    const overview = read("src/pages/OverviewPage.tsx");
    const vapi = read("src/lib/vapi-assistant-factory-v2.ts");

    expect(panel).toContain("Essential personal facts");
    expect(panel).toContain("composeSetupPersonality");
    expect(toneCompose).toContain("personally discreet");
    expect(studio).toContain("Try a private conversation");
    expect(studio).toContain("isBusinessAgent={Boolean(active.is_business_agent)}");
    expect(overview).toContain("Choose one personal job");
    expect(overview).toContain("First personal-agent workflow");
    expect(vapi).toContain("a personal Wireline agent for your principal");
    expect(vapi).toContain("## QUIET-HOURS MODE");
    expect(vapi).toContain("Never invent personal facts");
  });

  it("preserves rich personality when Studio Set up updates delivery tone", () => {
    const rich =
      "You are an elite personal assistant — an extension of your principal's time.\n\n## TEMPLATE SPECIALTY — Personal Concierge\nBook appointments and take messages.";
    const composed = composeSetupPersonality(rich, "Warm", false);
    expect(composed).toContain("elite personal assistant");
    expect(composed).toContain("TEMPLATE SPECIALTY — Personal Concierge");
    expect(composed).toContain("## DELIVERY TONE");
    expect(composed).toContain("Warm. Concise, useful, and personally discreet.");
    const again = composeSetupPersonality(composed, "Polished", false);
    expect(again.match(/## DELIVERY TONE/g)?.length).toBe(1);
    expect(again).toContain("Polished. Concise, useful, and personally discreet.");
    expect(again).not.toContain("Warm. Concise");
  });

  it("preserves concise custom personality text when updating delivery tone", () => {
    const concise = "Never interrupt meetings. Text before transferring unknown callers.";
    const composed = composeSetupPersonality(concise, "Calm", false);
    expect(composed).toContain(concise);
    expect(composed).toContain("## DELIVERY TONE");
    expect(composed).toContain("Calm. Concise, useful, and personally discreet.");
  });

  it("softens personal posture copy away from business-employee wording", () => {
    expect(PRODUCT_POSTURE.personal).toMatchObject({
      badge: "Personal voice agent",
      createCta: "Build personal voice agent",
      emptyTitle: "Your personal voice agent.",
      emptyBody: "Your calls. Your texts. Your email. Your outcomes.",
    });
  });
});

describe("founder dogfood posture integrity", () => {
  it("seeds a mixed personal and business roster and repairs legacy all-personal founder data", () => {
    const founderSeed = read("src/lib/founder-fleet-seed.ts");
    const founderBootstrap = read("src/lib/founder-bootstrap.ts");

    expect(founderSeed).toContain("isBusinessAgent: false");
    expect(founderSeed).toContain(
      'isBusinessAgent: template.isBusinessAgent ?? template.role !== "personal_assistant"',
    );
    expect(founderSeed).toContain('isBusinessAgent: row.role !== "personal_assistant"');
    expect(founderBootstrap).toContain("businessAgents > 0");
    expect(founderBootstrap).toContain("personalAgents > 0");
  });

  it("keeps operator labels readable and preserves a single main landmark", () => {
    const callOps = read("src/components/CallLogsClaude.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const overview = read("src/pages/OverviewPage.tsx");

    expect(callOps).toContain("humanizeTaxonomy");
    expect(callOps).not.toContain('{call.intent_label || call.summary || "Follow up requested"}');
    expect(workroom).not.toContain('<main className="flex h-full');
    expect(workroom).toContain('aria-label={mode === "test"');
    expect(overview).toContain('coreConnections.push("Phone")');
    expect(overview).not.toContain('coreConnections.push("Phone + SMS")');
  });
});

describe("founder hybrid pricing — Starter Plus pair capacity", () => {
  it("prices Starter Plus as the personal+business founder pair without breaking slot parity", async () => {
    const { planById, supportsFounderAgentPair } = await import("../src/lib/plan-catalog");
    const team = planById("team");
    expect(team?.price_usd_monthly).toBe(39);
    expect(team?.price_usd_annual).toBe(390);
    expect(team?.max_agents).toBe(2);
    expect(team?.included_phone_numbers).toBe(2);
    expect(team?.voice_minutes_monthly).toBe(120);
    expect(supportsFounderAgentPair("team")).toBe(true);
    expect(supportsFounderAgentPair("starter")).toBe(false);
    const catalog = read("src/lib/plan-catalog.ts");
    expect(catalog).toContain("2 live agents — personal Concierge + business voice agent");
    expect(read("src/pages/Pricing.tsx")).toContain("Founder hybrid");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Complete your founder pair");
  });
});
