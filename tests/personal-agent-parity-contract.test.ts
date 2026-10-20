import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERSONAL_DEFAULT_TEMPLATE_ID,
  PERSONAL_FAST_START_ROLE,
  resolveCreateEnabledTools,
  resolveCreatePersonality,
} from "../src/lib/agent-create-defaults";
import {
  BUSINESS_TOOL_NAMES,
  getDefaultAgentTools,
  resolveAgentTools,
} from "../src/lib/agent-capabilities";
import { BOT_ROLE_TEMPLATES, BOT_WORKSPACE_PROMISE } from "../src/lib/bot-product";
import { PRODUCT_POSTURE, customerAgentLanguage } from "../src/lib/product-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("unified Bot workspace compatibility", () => {
  it("preserves rich personal defaults without splitting the product", () => {
    expect(PERSONAL_FAST_START_ROLE).toBe("personal_assistant");
    expect(PERSONAL_DEFAULT_TEMPLATE_ID).toBe("personal-concierge");
    const personality = resolveCreatePersonality({
      role: PERSONAL_FAST_START_ROLE,
      isBusinessAgent: false,
      agentName: "Sarah",
    });
    expect(personality).toContain("elite personal assistant");
    expect(personality).toContain("You represent your principal");
    const tools = resolveCreateEnabledTools("personal_assistant", false);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(BUSINESS_TOOL_NAMES.has(tool)).toBe(false);
  });

  it("keeps explicit tool selections authoritative", () => {
    const selected = ["send_email", "book_appointment"] as const;
    expect(resolveAgentTools("sales", selected)).toEqual(selected);
    expect(resolveAgentTools("sales", null)).toEqual(getDefaultAgentTools());
  });

  it("resolves both legacy profile flags to the same customer-facing Bot language", () => {
    expect(customerAgentLanguage("personal")).toEqual(customerAgentLanguage("business"));
    expect(PRODUCT_POSTURE.personal).toEqual(PRODUCT_POSTURE.business);
    expect(customerAgentLanguage("personal")).toMatchObject({
      singular: "Bot",
      plural: "Bots",
      navLabel: "Workspace",
      createCta: "Create Bot",
    });
    expect(BOT_WORKSPACE_PROMISE.title).toBe("Your Bot. Already Moving");
    expect(BOT_WORKSPACE_PROMISE.description).toContain(
      "Calls, conversations, and tasks stay together",
    );
  });

  it("keeps operations, everyday, and custom starters in one role catalog", () => {
    const categories = new Set(BOT_ROLE_TEMPLATES.map((template) => template.category));
    expect(categories).toEqual(new Set(["Operations", "Everyday", "Custom"]));
    expect(BOT_ROLE_TEMPLATES.map((template) => template.name)).toEqual(
      expect.arrayContaining([
        "Front Desk",
        "Sales Rep",
        "Personal Assistant",
        "Family Concierge",
        "Create Your Own",
      ]),
    );
  });

  it("keeps creation and Overview free of posture routing", () => {
    const dialog = read("src/components/CreateAgentDialog.tsx");
    const overview = read("src/pages/OverviewPage.tsx");
    const studio = read("src/components/StudioWorkspaceV2.tsx");
    expect(dialog).toContain('workspace_model: "one_workspace"');
    expect(dialog).not.toMatch(/setPosture|rolesForPosture/);
    expect(overview).toContain("UnifiedInbox");
    expect(overview).toContain("BotRoster");
    expect(overview).not.toContain("posture=");
    expect(studio).not.toContain("posture=");
  });

  it("prices Starter Plus as two configurable Bot slots", async () => {
    const { planById } = await import("../src/lib/plan-catalog");
    const team = planById("team");
    expect(team?.price_usd_monthly).toBe(39);
    expect(team?.price_usd_annual).toBe(390);
    expect(team?.max_agents).toBe(2);
    expect(team?.included_phone_numbers).toBe(2);
    expect(team?.checkoutAvailability).toBe("legacy_only");
    expect(read("src/pages/Pricing.tsx")).toContain('plan.catalogFamily === "channels"');
  });
});
