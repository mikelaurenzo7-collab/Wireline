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
import { BUSINESS_TOOL_NAMES, getDefaultAgentTools } from "../src/lib/agent-capabilities";
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
    expect(personality!).toContain("Sarah");
  });

  it("strips business-only tools from personal create while business keeps the full catalog", () => {
    const personalTools = resolveCreateEnabledTools("personal_assistant", false);
    const businessTools = resolveCreateEnabledTools("sales", true);
    expect(businessTools).toEqual(getDefaultAgentTools());
    expect(personalTools.length).toBeGreaterThan(0);
    for (const tool of personalTools) {
      expect(BUSINESS_TOOL_NAMES.has(tool)).toBe(false);
    }
    expect(personalTools).toContain("book_appointment");
    expect(personalTools).toContain("send_text_message");
    expect(personalTools).not.toContain("crm_log_call");
    expect(personalTools).not.toContain("search_leads");
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
      badge: "Personal agent",
      createCta: "Build personal agent",
      emptyTitle: "Your personal agent.",
      emptyBody: "Your calls. Your texts. Your email. Your outcomes.",
    });
  });
});

describe("founder hybrid pricing — Starter Plus pair capacity", () => {
  it("prices Starter Plus as the personal+business founder pair without breaking slot parity", async () => {
    const { planById, supportsFounderAgentPair } = await import("../src/lib/plan-catalog");
    const team = planById("team");
    expect(team?.price_usd_monthly).toBe(24);
    expect(team?.price_usd_annual).toBe(240);
    expect(team?.max_agents).toBe(2);
    expect(team?.included_phone_numbers).toBe(2);
    expect(team?.voice_minutes_monthly).toBe(50);
    expect(supportsFounderAgentPair("team")).toBe(true);
    expect(supportsFounderAgentPair("starter")).toBe(false);
    const catalog = read("src/lib/plan-catalog.ts");
    expect(catalog).toContain("2 live agents — personal Concierge + business AI employee");
    expect(read("src/pages/Pricing.tsx")).toContain("Founder hybrid");
    expect(read("src/pages/OverviewPage.tsx")).toContain("Complete your founder pair");
  });
});
