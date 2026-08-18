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
import { BOT_ROLE_TEMPLATES, BOT_WORKSPACE_PROMISE } from "../src/lib/bot-product";
import {
  PRODUCT_POSTURE,
  customerAgentLanguage,
} from "../src/lib/product-copy";
import { composeSetupPersonality } from "../src/lib/compose-setup-personality";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("legacy capability profiles preserve rich defaults", () => {
  it("keeps the personal assistant seed and concierge overlay available", () => {
    expect(PERSONAL_FAST_START_ROLE).toBe("personal_assistant");
    expect(PERSONAL_DEFAULT_TEMPLATE_ID).toBe("personal-concierge");
    const personality = resolveCreatePersonality({
      role: PERSONAL_FAST_START_ROLE,
      isBusinessAgent: false,
      agentName: "Sarah",
    });
    expect(personality).toBeTruthy();
    expect(personality).toContain("elite personal assistant");
    expect(personality).toContain("TEMPLATE SPECIALTY: Personal Concierge");
    expect(personality).toContain("You represent your principal");
    expect(personality).not.toContain("You represent Sarah");
  });

  it("never substitutes the Bot name as the represented business", () => {
    const personality = resolveCreatePersonality({
      role: "sales",
      isBusinessAgent: true,
      templateId: "sales-sdr",
      agentName: "Revenue Desk",
    });
    expect(personality).toContain("from your business");
    expect(personality).not.toContain("from Revenue Desk");
  });

  it("seeds role-focused tools without making the template a permanent limit", () => {
    const personalTools = resolveCreateEnabledTools("personal_assistant", false);
    const businessTools = resolveCreateEnabledTools("sales", true);
    const deviceActions = ["navigate_to", "add_reminder", "play_music"] as const;

    expect(personalTools.length).toBeGreaterThan(0);
    for (const tool of personalTools) expect(BUSINESS_TOOL_NAMES.has(tool)).toBe(false);
    for (const tool of deviceActions) {
      expect(personalTools).not.toContain(tool);
      expect(businessTools).not.toContain(tool);
    }

    expect(businessTools.length).toBeLessThan(getDefaultAgentTools().length);
    expect(businessTools).toContain("send_email");
    expect(businessTools).toContain("book_appointment");
    expect(businessTools).toContain("crm_create_opportunity");
    expect(businessTools).toContain("send_contract");
    expect(personalTools).toContain("book_appointment");
    expect(personalTools).toContain("send_text_message");
  });

  it("keeps explicit tool selections authoritative through plan entitlement", () => {
    const selected = ["send_email", "book_appointment"] as const;
    expect(applyPlanToolUnlocks(selected, "enterprise")).toEqual(selected);
    expect(resolveAgentTools("sales", selected)).toEqual(selected);

    const personalRole = getRoleToolSet("personal_assistant");
    expect(personalRole).not.toContain("send_slack_notification");
    expect(personalRole).not.toContain("send_teams_message");
    expect(personalRole).not.toContain("send_contract");
    expect(resolveAgentTools("sales", null)).toEqual(getDefaultAgentTools());
  });

  it("retains template-category compatibility for provider defaults", () => {
    expect(isBusinessTemplateCategory("Personal & Lifestyle")).toBe(false);
    expect(isBusinessTemplateCategory("Sales & Revenue")).toBe(true);
    expect(isBusinessTemplateCategory(null)).toBe(true);
  });
});

describe("one-workspace Bot parity", () => {
  it("resolves both legacy account modes to the same customer-facing Bot language", () => {
    expect(customerAgentLanguage("personal")).toEqual(customerAgentLanguage("business"));
    expect(customerAgentLanguage("personal")).toMatchObject({
      singular: "Bot",
      plural: "Bots",
      navLabel: "Bot Studio",
      createCta: "Create Bot",
      setupPrompt: "What should your Bot do?",
    });
    expect(PRODUCT_POSTURE.personal).toEqual(PRODUCT_POSTURE.business);
    expect(BOT_WORKSPACE_PROMISE.title).toBe("ONE WORKSPACE. EVERY BOT.");
  });

  it("keeps business, personal, and custom starters in the same role catalog", () => {
    const categories = new Set(BOT_ROLE_TEMPLATES.map((template) => template.category));
    const names = BOT_ROLE_TEMPLATES.map((template) => template.name);
    expect(categories).toEqual(new Set(["Business", "Personal", "Custom"]));
    expect(names).toContain("Front Desk");
    expect(names).toContain("Sales Rep");
    expect(names).toContain("Personal Assistant");
    expect(names).toContain("Family Concierge");
    expect(names).toContain("Create Your Own");
  });

  it("uses one role-first creation dialog instead of a posture selector", () => {
    const dialog = read("src/components/CreateAgentDialog.tsx");
    expect(dialog).toContain("BOT_ROLE_TEMPLATES.map");
    expect(dialog).toContain("BOT_CHANNELS.map");
    expect(dialog).toContain("Employee roles, personal starters, and Create Your Own");
    expect(dialog).toContain('workspace_model: "one_workspace"');
    expect(dialog).not.toMatch(/setPosture|rolesForPosture|Choose one personal job/);
    expect(dialog).not.toContain('return posture === "business"');
    expect(dialog).not.toContain("Warm. Concise. Useful.");
    expect(dialog).not.toContain('type: "personality"');
  });

  it("keeps server and mobile creation on shared compatibility seeding", () => {
    const templates = read("src/components/AgentTemplates.tsx");
    const mobile = read("src/routes/mobile-routes.ts");
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    expect(templates).toContain("isBusinessTemplateCategory(modalTemplate.category)");
    expect(mobile).toContain("resolveCreateEnabledTools(role, isBusinessAgent)");
    expect(mobile).toContain("resolveCreatePersonality");
    expect(agentRoutes).toContain("resolveCreatePersonality");
    expect(agentRoutes).toContain("resolveCreateEnabledTools(role, isBusinessAgent)");
  });

  it("shows one Bot roster and one Overview regardless of stored profile flags", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const shell = read("src/components/WorkspaceShell.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");

    expect(overview).toContain("UnifiedInbox");
    expect(overview).toContain("BotRoster");
    expect(overview).toContain("Create Your Own");
    expect(overview).not.toMatch(/personalAgents|businessAgents|founderPair|posture=/);
    expect(shell).toContain("const orderedAgents = activeAgent");
    expect(shell).toContain("{agents.length}");
    expect(shell).not.toContain("const postureAgents =");
    expect(studio).not.toContain("useAccount");
    expect(studio).not.toContain("posture=");
  });

  it("preserves personal safety and rich tone composition inside the unified product", () => {
    const panel = read("src/components/StudioAgentWorkspacePanel.tsx");
    const toneCompose = read("src/lib/compose-setup-personality.ts");
    const vapi = read("src/lib/vapi-assistant-factory-v2.ts");

    expect(panel).toContain("composeSetupPersonality");
    expect(toneCompose).toContain("personally discreet");
    expect(vapi).toContain("a personal Wireline agent for your principal");
    expect(vapi).toContain("## QUIET-HOURS MODE");
    expect(vapi).toContain("Never invent personal facts");

    const rich =
      "You are an elite personal assistant.\n\n## TEMPLATE SPECIALTY: Personal Concierge\nBook appointments and take messages.";
    const composed = composeSetupPersonality(rich, "Warm", false);
    expect(composed).toContain("elite personal assistant");
    expect(composed).toContain("TEMPLATE SPECIALTY: Personal Concierge");
    expect(composed).toContain("## DELIVERY TONE");
    expect(composed).toContain("personally discreet");
  });
});

describe("founder and pricing compatibility", () => {
  it("keeps legacy seed flags for safe migrations without using them as workspace navigation", () => {
    const founderSeed = read("src/lib/founder-fleet-seed.ts");
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(founderSeed).toContain("isBusinessAgent: false");
    expect(founderSeed).toContain("isBusinessAgent:");
    expect(shell).not.toContain("postureAgents");
    expect(shell).not.toContain("matchesPosture");
  });

  it("keeps operator labels and shared controls truthful", () => {
    const callOps = read("src/components/CallLogsClaude.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const sms = read("src/components/SmsThreads.tsx");
    const connections = read("src/components/CrmConnectionCard.tsx");
    const billing = read("src/components/StripeBillingCard.tsx");

    expect(callOps).toContain("humanizeTaxonomy");
    expect(workroom).not.toContain('<main className="flex h-full');
    expect(workroom).toContain('aria-label={mode === "test"');
    expect(sms).toContain("SMS conversations will appear here after messaging is connected");
    expect(connections).toContain("Connect ${label}");
    expect(connections).toContain("Disconnect ${label}");
    expect(billing).toContain("Plan access is active");
  });

  it("prices Starter Plus as two configurable Bot slots rather than a required personal-business pair", async () => {
    const { planById } = await import("../src/lib/plan-catalog");
    const team = planById("team");
    expect(team?.price_usd_monthly).toBe(39);
    expect(team?.price_usd_annual).toBe(390);
    expect(team?.max_agents).toBe(2);
    expect(team?.included_phone_numbers).toBe(2);
    expect(team?.voice_minutes_monthly).toBe(100);

    const pricing = read("src/pages/Pricing.tsx");
    expect(pricing).toContain("Starter Plus");
    expect(pricing).not.toContain("Complete your founder pair");
    expect(read("src/pages/OverviewPage.tsx")).not.toContain("Complete your founder pair");
  });
});
